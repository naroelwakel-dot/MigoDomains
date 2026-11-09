/* ==========================================================================
   Migo Domains — طبقة الخدمة (Service Layer)
   --------------------------------------------------------------------------
   هنا منطق العمل كله: التوفر → عرض السعر → الطلب → الدفع → التنفيذ.

   قواعد مفروضة في الكود نفسه:
     1) **مفيش سعر بيع من تكلفة وهمية** (بنمرّ على جسر المزوّد، ومفيش تجاوز).
     2) المالك الحقيقي هو **العميل** — بيانات الشركة/الموزّع مرفوضة كمالك.
     3) الطلب بيمرّ على آلة حالات؛ مفيش تسجيل قبل دفع مُتحقَّق منه.
     4) **مفيش تسريب تكلفة/هامش** للعميل — بنرجّع clientQuote بس.
     5) أي عملية حسّاسة بتتسجّل في سجل التدقيق.
   ========================================================================== */

import { OPERATIONS } from "../../pricing/lib/config.js";
import { buildQuoteFromProvider, recheckFromProvider } from "../../providers/lib/bridge.js";
import { AVAILABILITY_STATES as S } from "../../providers/lib/states.js";
import { ServiceError, SERVICE_ERROR_CODES as C } from "./errors.js";
import { createAuditLog } from "./audit.js";
import { createIdempotencyStore, fingerprint } from "./idempotency.js";
import { createAuthz } from "./authz.js";
import { ORDER_STATUSES as OS, assertTransition, isTerminal } from "./orders.js";

const COMPANY_CONTACTS = [/migoai/i, /migo-ai/i, /naroelwakel/i, /@migo\./i];

export function createBackendService({
  provider,
  availability = null,
  config = null,
  pricingConfig = undefined,
  now = () => new Date(),
  audit = createAuditLog({ now }),
  idempotency = createIdempotencyStore(),
  payments = null,
  authz = createAuthz(),
} = {}) {
  if (!provider) throw new Error("طبقة الخدمة محتاجة مزوّد");

  const orders = new Map();
  let seq = 0;
  const nextId = () => "ord_" + String(++seq).padStart(6, "0");

  /* ------------------------------- أدوات ------------------------------- */

  function validateDomain(domain) {
    const name = String(domain || "").trim().toLowerCase();
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(name)) {
      throw new ServiceError("اسم دومين غير صالح", C.VALIDATION, { domain: name });
    }
    return name;
  }

  function validateOperation(operation) {
    if (!OPERATIONS.includes(operation)) {
      throw new ServiceError("عملية غير مدعومة: " + operation, C.VALIDATION, { operation });
    }
    return operation;
  }

  function validateRegistrant(input) {
    if (!input || typeof input !== "object") throw new ServiceError("بيانات المالك مطلوبة", C.VALIDATION);
    const email = String(input.email || "").trim().toLowerCase();
    const name = String(input.name || "").trim();
    const country = String(input.country || "").trim().toUpperCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ServiceError("بريد المالك غير صالح", C.VALIDATION);
    if (name.length < 2) throw new ServiceError("اسم المالك مطلوب", C.VALIDATION);
    if (!/^[A-Z]{2}$/.test(country)) throw new ServiceError("كود دولة المالك لازم حرفين (ISO)", C.VALIDATION);
    if (COMPANY_CONTACTS.some((re) => re.test(email) || re.test(name))) {
      throw new ServiceError("بيانات الشركة/الموزّع ممنوعة كمالك — الملكية لازم تكون للعميل", C.VALIDATION);
    }
    return Object.freeze({ name, email, country, phone: input.phone ? String(input.phone) : null });
  }

  function clientAvailability(raw) {
    if (!raw) return null;
    return Object.freeze({
      name: raw.name,
      state: raw.state,
      definitive: raw.definitive !== false,
      requiresRegistrarConfirmation: Boolean(raw.requiresRegistrarConfirmation) || raw.state === S.AVAILABLE_CONFIRMED,
      reason: raw.reason || null,
      checkedAt: raw.checkedAt || now().toISOString(),
    });
  }

  function clientOrder(order) {
    return Object.freeze({
      orderId: order.orderId,
      domain: order.domain,
      operation: order.operation,
      years: order.years,
      status: order.status,
      quote: order.clientQuote,
      payment: order.payment,
      domainRecord: order.domainRecord || null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      history: order.history.slice(),
    });
  }

  function touch(order, to, detail = null) {
    assertTransition(order.status, to);
    order.status = to;
    order.updatedAt = now().toISOString();
    order.history.push(Object.freeze({ at: order.updatedAt, status: to, detail }));
    return order;
  }

  async function providerAvailability(name) {
    if (typeof provider.checkAvailability !== "function") return null;
    const raw = await provider.checkAvailability(name);
    if (availability && typeof availability.combine === "function") {
      return availability.combine({ state: raw.state, definitive: raw.definitive, source: "registrar", name, checkedAt: raw.checkedAt }, raw);
    }
    return raw;
  }

  /* ------------------------------ قراءة -------------------------------- */

  async function checkAvailability(domain, { claims } = {}) {
    const name = validateDomain(domain);
    let result = null;
    if (typeof provider.checkAvailability === "function") {
      result = await providerAvailability(name);
    } else if (availability) {
      result = await availability.check(name);
    } else {
      throw new ServiceError("مفيش مصدر للتحقق من التوفر", C.PROVIDER_ERROR);
    }
    return clientAvailability(result);
  }

  async function search({ names = [], tlds = [], claims } = {}) {
    const limits = (config && config.limits && config.limits.search) || { maxNames: 20, maxTlds: 12 };
    if (names.length > limits.maxNames) throw new ServiceError("عدد الأسماء أكبر من الحد المسموح", C.VALIDATION);
    if (tlds.length > limits.maxTlds) throw new ServiceError("عدد الامتدادات أكبر من الحد المسموح", C.VALIDATION);
    const list = [];
    for (const raw of names) {
      const base = String(raw || "").trim().toLowerCase().split(".")[0];
      if (!/^[a-z0-9-]+$/.test(base)) throw new ServiceError("اسم بحث غير صالح", C.VALIDATION, { name: base });
      for (const t of tlds) {
        const name = base + "." + String(t).replace(/^\./, "").toLowerCase();
        list.push(await checkAvailability(name, { claims }));
      }
    }
    return list;
  }

  /* ----------------------------- التسعير ------------------------------- */

  async function quote({ domain, operation = "registration", fx = null, allowMock = false, claims } = {}) {
    const name = validateDomain(domain);
    validateOperation(operation);
    const built = buildQuoteFromProvider({ provider, domain: name, operation, fx, config: pricingConfig, now: now(), allowMock });
    if (!built.ok) {
      return Object.freeze({ ok: false, reason: built.reason, message: built.message });
    }
    audit.append({ action: "quote.issued", target: name, actor: (claims && claims.sub) || "anonymous", detail: { operation, quoteId: built.quote.quoteId } });
    return Object.freeze({ ok: true, quoteId: built.quote.quoteId, quote: built.clientQuote, localTestOnly: Boolean(built.localTestOnly) });
  }

  /* ------------------------------ الطلبات ------------------------------ */

  async function createOrder({ customerId, domain, operation = "registration", years = 1, registrant, fx = null, allowMock = false, idempotencyKey, claims } = {}) {
    const user = customerId || authz.requireUser(claims);
    const name = validateDomain(domain);
    validateOperation(operation);
    if (!Number.isInteger(years) || years < 1 || years > 10) throw new ServiceError("سنوات التسجيل من 1 لـ10", C.VALIDATION);
    const contact = validateRegistrant(registrant);

    const fp = fingerprint({ user, name, operation, years, registrant: contact.email });
    return idempotency.remember(idempotencyKey, fp, async () => {
      const built = buildQuoteFromProvider({ provider, domain: name, operation, fx, config: pricingConfig, now: now(), allowMock });
      if (!built.ok) throw new ServiceError(built.message, C.MOCK_NOT_A_REAL_PRICE, { reason: built.reason });

      const at = now().toISOString();
      const order = {
        orderId: nextId(),
        customerId: user,
        domain: name,
        operation,
        years,
        registrant: contact,
        fx,
        quote: built.quote, // داخلي — فيه التكلفة، ومينفعش يطلع للعميل
        clientQuote: built.clientQuote,
        localTestOnly: Boolean(built.localTestOnly),
        status: OS.AWAITING_PAYMENT,
        payment: null,
        domainRecord: null,
        createdAt: at,
        updatedAt: at,
        history: [{ at, status: OS.AWAITING_PAYMENT, detail: "إنشاء الطلب" }],
      };
      orders.set(order.orderId, order);
      audit.append({ action: "order.created", target: name, actor: user, detail: { orderId: order.orderId, operation } });
      return clientOrder(order);
    });
  }

  function getOrderFor(orderId, claims) {
    const order = orders.get(orderId);
    if (!order) throw new ServiceError("الطلب غير موجود", C.NOT_FOUND, { orderId });
    authz.assertOwns(claims, order);
    return order;
  }

  function getOrder(orderId, claims) {
    return clientOrder(getOrderFor(orderId, claims));
  }

  function listOrders(claims) {
    const user = authz.requireUser(claims);
    const admin = authz.isAdmin(claims);
    return [...orders.values()].filter((o) => admin || o.customerId === user).map(clientOrder);
  }

  /* --------------------- دومينات العميل --------------------- */

  /**
   * دومين العميل = طلب مكتمل له سجل عند المزوّد.
   * مفيش أي تكلفة أو هامش هنا، وبنرجّع نسخة مخصّصة للعميل بس.
   */
  function clientDomainRecord(order) {
    const rec = order.domainRecord || {};
    return Object.freeze({
      domain: order.domain,
      status: rec.status || "active",
      expiresAt: rec.expiresAt || null,
      nameservers: Array.isArray(rec.nameservers) ? rec.nameservers.slice() : [],
      orderId: order.orderId,
      years: order.years,
      registeredAt: order.updatedAt || order.createdAt,
    });
  }

  /** دومينات العميل (أو كل الدومينات لو كان مشرف). مرتبة بالأقرب انتهاءً. */
  function listDomains(claims) {
    const user = authz.requireUser(claims);
    const admin = authz.isAdmin(claims);
    return [...orders.values()]
      .filter((o) => o.status === OS.COMPLETED && o.domainRecord)
      .filter((o) => admin || o.customerId === user)
      .map(clientDomainRecord)
      .sort((a, b) => String(a.expiresAt || "").localeCompare(String(b.expiresAt || "")));
  }

  /* ------------------------------- الدفع ------------------------------- */

  /** المبلغ المطلوب للطلب (بالوحدة الصغرى) — EGP لو متاح، وإلا USD. */
  function amountFor(order) {
    const egp = order.clientQuote && order.clientQuote.egp;
    if (egp && egp.available && egp.value) {
      const cents = Math.round(Number(egp.value) * 100);
      return { amount: cents, currency: "EGP" };
    }
    const usd = order.clientQuote && order.clientQuote.sale && order.clientQuote.sale.usd;
    return { amount: Math.round(Number(usd) * 100), currency: "USD" };
  }

  function createPaymentIntent({ orderId, claims } = {}) {
    if (!payments) throw new ServiceError("مفيش مزوّد دفع مربوط", C.PROVIDER_ERROR);
    const order = getOrderFor(orderId, claims);
    if (order.status !== OS.AWAITING_PAYMENT) throw new ServiceError("الطلب مش في انتظار الدفع", C.INVALID_STATE);
    const { amount, currency } = amountFor(order);
    const intent = payments.createIntent({ orderId: order.orderId, amount, currency });
    audit.append({ action: "payment.intent_created", target: order.domain, actor: order.customerId, detail: { orderId: order.orderId, intentId: intent.intentId } });
    return intent;
  }

  async function confirmPayment({ rawBody, signature } = {}) {
    if (!payments) throw new ServiceError("مفيش مزوّد دفع مربوط", C.PROVIDER_ERROR);
    const check = await payments.verifyWebhook(rawBody, signature);
    if (!check.ok) {
      audit.append({ action: "payment.rejected", outcome: "error", detail: { reason: check.reason } });
      throw new ServiceError("إشعار دفع غير موثوق", C.PAYMENT_INVALID, { reason: check.reason });
    }
    const event = check.event;
    const order = orders.get(event.orderId);
    if (!order) throw new ServiceError("طلب غير موجود", C.NOT_FOUND, { orderId: event.orderId });

    // تكرار الإشعار: الطلب مدفوع بالفعل = نفس النتيجة، مفيش تنفيذ تاني.
    if (order.status !== OS.AWAITING_PAYMENT && order.payment) {
      return clientOrder(order);
    }
    const expected = amountFor(order);
    if (Number(event.amount) !== expected.amount || String(event.currency || "").toUpperCase() !== expected.currency) {
      audit.append({ action: "payment.amount_mismatch", outcome: "error", target: order.domain, detail: { orderId: order.orderId } });
      throw new ServiceError("مبلغ الدفع لا يطابق قيمة الطلب", C.PAYMENT_AMOUNT_MISMATCH);
    }
    order.payment = { intentId: event.intentId || null, amount: expected.amount, currency: expected.currency, at: now().toISOString() };
    touch(order, OS.PAID, "تأكيد الدفع");
    audit.append({ action: "order.paid", target: order.domain, actor: order.customerId, detail: { orderId: order.orderId } });
    return clientOrder(order);
  }

  /* ------------------------------ التنفيذ ------------------------------ */

  async function fulfill({ orderId, allowMock = false, claims } = {}) {
    const order = orderId ? getOrderFor(orderId, claims) : null;
    if (!order) throw new ServiceError("الطلب غير موجود", C.NOT_FOUND);
    if (order.status !== OS.PAID) throw new ServiceError("مفيش تنفيذ قبل تأكيد الدفع", C.INVALID_STATE);

    touch(order, OS.FULFILLING, "بدء التنفيذ");

    // 1) فحص التوفر من المصدر المرجعي (Registrar) — طازج، مش من الـcache.
    if (availability && typeof availability.invalidate === "function") availability.invalidate(order.domain);
    const avail = typeof provider.checkAvailability === "function" ? await provider.checkAvailability(order.domain) : null;
    if (avail && avail.state !== S.AVAILABLE_CONFIRMED) {
      const reason = avail.state === S.REGISTERED ? C.DOMAIN_TAKEN : C.INVALID_STATE;
      touch(order, OS.MANUAL_REVIEW, "الدومين مش متاح مؤكد: " + avail.state);
      audit.append({ action: "order.needs_review", outcome: "error", target: order.domain, detail: { orderId: order.orderId, state: avail.state } });
      throw new ServiceError("الدومين مش متاح مؤكد قبل التسجيل", reason, { state: avail.state });
    }

    // 2) إعادة التحقق من التكلفة قبل التسجيل (قاعدة إلزامية).
    const recheck = recheckFromProvider(order.quote, { provider, domain: order.domain, operation: order.operation, fx: order.fx, now: now(), allowMock });
    if (!recheck.ok || recheck.requiresRequote) {
      touch(order, OS.MANUAL_REVIEW, recheck.ok ? "تغيّر السعر — يحتاج عرض جديد" : "تكلفة غير موثوقة");
      audit.append({ action: "order.needs_requote", outcome: "error", target: order.domain, detail: { orderId: order.orderId, status: recheck.status } });
      throw new ServiceError("السعر اتغيّر — محتاج عرض سعر جديد", C.QUOTE_UNAVAILABLE, { status: recheck.status });
    }

    // 3) التسجيل الفعلي عند المزوّد.
    try {
      const record = await provider.registerDomain({
        name: order.domain,
        years: order.years,
        registrant: order.registrant,
        idempotencyKey: "reg:" + order.orderId,
      });
      order.domainRecord = {
        name: record.name,
        status: record.status,
        expiresAt: record.expiresAt || (record.record && record.record.expiresAt) || null,
        providerId: record.id || (record.record && record.record.id) || null,
        nameservers: record.nameservers || (record.record && record.record.nameservers) || [],
      };
      touch(order, OS.COMPLETED, "تم التسجيل");
      audit.append({ action: "order.completed", target: order.domain, actor: order.customerId, detail: { orderId: order.orderId } });
      return clientOrder(order);
    } catch (err) {
      const code = err && err.code ? err.code : C.PROVIDER_ERROR;
      touch(order, OS.FAILED, "فشل التسجيل: " + code);
      audit.append({ action: "order.failed", outcome: "error", target: order.domain, detail: { orderId: order.orderId, code } });
      throw new ServiceError("فشل تنفيذ التسجيل عند المزوّد", C.PROVIDER_ERROR, { code });
    }
  }

  /* -------------------- عمليات ما بعد التسجيل (لصاحب الدومين) -------------------- */

  function requireOwnedDomainRecord(domain, claims) {
    const name = validateDomain(domain);
    const owner = [...orders.values()].find((o) => o.domain === name && o.status === OS.COMPLETED);
    if (!owner) throw new ServiceError("الدومين مش مسجّل عندنا", C.NOT_FOUND, { domain: name });
    authz.assertOwns(claims, owner);
    return owner;
  }

  async function renewDomain({ domain, years = 1, claims } = {}) {
    requireOwnedDomainRecord(domain, claims);
    if (typeof provider.renewDomain !== "function") throw new ServiceError("المزوّد لا يدعم التجديد", C.PROVIDER_ERROR);
    const record = await provider.renewDomain({ name: validateDomain(domain), years: Number(years) });
    audit.append({ action: "domain.renewed", target: domain, actor: claims && claims.sub, detail: { years } });
    return Object.freeze({ ok: true, domain, years, status: record.status });
  }

  async function transferDomain({ domain, authCode, registrant, claims } = {}) {
    if (typeof provider.transferDomain !== "function") throw new ServiceError("المزوّد لا يدعم التحويل", C.PROVIDER_ERROR);
    const contact = validateRegistrant(registrant);
    const record = await provider.transferDomain({ name: validateDomain(domain), authCode, registrant: contact });
    audit.append({ action: "domain.transfer_started", target: domain, actor: claims && claims.sub, detail: { status: record.status } });
    return Object.freeze({ ok: true, domain, status: record.status });
  }

  async function setNameservers({ domain, nameservers, claims } = {}) {
    requireOwnedDomainRecord(domain, claims);
    if (typeof provider.updateNameservers !== "function") throw new ServiceError("المزوّد لا يدعم تعديل الـDNS", C.PROVIDER_ERROR);
    if (!Array.isArray(nameservers) || nameservers.length < 2) throw new ServiceError("لازم سيرفري أسماء على الأقل", C.VALIDATION);
    const record = await provider.updateNameservers({ name: validateDomain(domain), nameservers });
    audit.append({ action: "domain.nameservers_updated", target: domain, actor: claims && claims.sub });
    return Object.freeze({ ok: true, domain, nameservers: record.nameservers || nameservers });
  }

  return {
    search,
    checkAvailability,
    quote,
    createOrder,
    getOrder,
    listOrders,
    listDomains,
    createPaymentIntent,
    confirmPayment,
    fulfill,
    renewDomain,
    transferDomain,
    setNameservers,
    audit,
    idempotency,
    authz,
    _orders: orders,
  };
}
