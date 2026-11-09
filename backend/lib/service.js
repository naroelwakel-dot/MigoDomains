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

import { OPERATIONS, DEFAULT_CONFIG } from "../../pricing/lib/config.js";
import { priceFromCost, toFixedString, toMicros, toDecimalString, convertToEgp } from "../../pricing/lib/index.js";
import { buildQuoteFromProvider, recheckFromProvider } from "../../providers/lib/bridge.js";
import { AVAILABILITY_STATES as S, REGISTRY_LOCKS } from "../../providers/lib/states.js";
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

  /* ------------------- معاينة تسعير للإدارة ------------------- */

  /** نص قاعدة الهامش للعرض: «+3.00 ثابت» أو «15% بحد أدنى 4.00». */
  function ruleText(detail) {
    if (!detail) return "-";
    if (detail.mode === "percent") return detail.value + "% بحد أدنى " + detail.floor;
    return "+" + detail.value + " ثابت";
  }

  /**
   * معاينة الهامش وسعر البيع من تكلفة كلية — **للإدارة بس**.
   * بتستخدم نفس محرك التسعير المعتمد (`pricing/lib`) عشان لوحة الإدارة
   * مايبقاش عندها محرك تاني بيتفرّع عنه. مفيش أي حساب تسعير في المتصفح.
   * التكلفة والهامش بيظهروا هنا فقط (قواعد الفصل في docs/DESIGN_SYSTEM.md).
   */
  function previewPrice({ costUsd, fx = null, claims } = {}) {
    authz.requireAdmin(claims);
    const pricing = pricingConfig || DEFAULT_CONFIG;
    const rounding = pricing.rounding || DEFAULT_CONFIG.rounding;

    let totalMicros;
    try {
      totalMicros = toMicros(costUsd);
    } catch (err) {
      throw new ServiceError("تكلفة غير صحيحة: صيغة رقمية مطلوبة", C.VALIDATION);
    }
    if (totalMicros === null) throw new ServiceError("التكلفة مطلوبة", C.VALIDATION);
    if (totalMicros < 0n) throw new ServiceError("التكلفة لا تكون سالبة", C.VALIDATION);

    let priced;
    try {
      priced = priceFromCost(totalMicros, {
        tiers: pricing.tiers || DEFAULT_CONFIG.tiers,
        zeroCost: pricing.zeroCost || DEFAULT_CONFIG.zeroCost,
      });
    } catch (err) {
      // رفض المحرك (زي التكلفة صفر بدون قرار P3) بيانات للعرض، مش خطأ تنفيذ.
      if (err && err.name === "MarginError") {
        return Object.freeze({ priced: false, reason: err.code || "MARGIN_ERROR", message: err.message });
      }
      throw err;
    }

    const usd = (micros) => toFixedString(micros, rounding.usdDecimals, rounding.mode);

    let egp = { available: false, value: null, reason: "NO_FX", message: "اكتب سعر صرف لعرض المقابل بالجنيه." };
    if (fx && fx.rate !== undefined && fx.rate !== null && fx.rate !== "") {
      const converted = convertToEgp(
        priced.saleMicros,
        { rate: fx.rate, source: "admin_manual", fetchedAt: now() },
        { now: now(), maxAgeMs: (pricing.fx && pricing.fx.maxAgeMs) || DEFAULT_CONFIG.fx.maxAgeMs, bufferPercent: "0" }
      );
      egp = converted.ok
        ? { available: true, value: toFixedString(converted.egpMicros, rounding.egpDecimals, rounding.mode), rate: converted.rate, source: converted.source }
        : { available: false, value: null, reason: converted.reason, message: converted.message };
    }

    audit.append({
      action: "admin.price_preview",
      target: "price-preview",
      actor: claims.sub,
      detail: { costUsd: usd(totalMicros) },
    });

    return Object.freeze({
      priced: true,
      costUsd: usd(totalMicros),
      marginUsd: usd(priced.marginMicros),
      saleUsd: usd(priced.saleMicros),
      marginMicros: toDecimalString(priced.marginMicros),
      saleMicros: toDecimalString(priced.saleMicros),
      tier: Object.freeze({ label: priced.marginLabel || null, rule: ruleText(priced.marginDetail), id: priced.marginRuleId || null }),
      egp: Object.freeze(egp),
    });
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

  /* سجلات DNS العادية. سجلات السلطة (NS · CAA) ليها مسار الـNameservers
     وممنوعة من هنا — الخدمة بتفرض ده قبل ما توصل للمزوّد. */
  const AUTHORITY_RECORD_TYPES = Object.freeze(["NS", "CAA"]);

  function clientDnsRecord(rec) {
    return Object.freeze({
      id: rec && rec.id ? rec.id : null,
      type: rec && rec.type ? rec.type : null,
      name: rec && rec.name ? rec.name : null,
      value: rec && rec.value ? rec.value : null,
      ttl: rec && rec.ttl !== undefined ? rec.ttl : null,
      authority: Boolean(rec && rec.authority),
    });
  }

  async function getDnsRecords({ domain, claims } = {}) {
    requireOwnedDomainRecord(domain, claims);
    if (typeof provider.getDnsRecords !== "function") throw new ServiceError("المزوّد لا يدعم قراءة سجلات DNS", C.PROVIDER_ERROR);
    const out = await provider.getDnsRecords(validateDomain(domain));
    const records = Array.isArray(out && out.records) ? out.records : [];
    return Object.freeze({ ok: true, domain, records: records.map(clientDnsRecord) });
  }

  async function updateDnsRecords({ domain, records, claims } = {}) {
    requireOwnedDomainRecord(domain, claims);
    if (typeof provider.updateDnsRecords !== "function") throw new ServiceError("المزوّد لا يدعم تعديل سجلات DNS", C.PROVIDER_ERROR);
    if (!Array.isArray(records)) throw new ServiceError("سجلات DNS لازم تكون قائمة", C.VALIDATION);
    const offending = records
      .map((r) => String((r && r.type) || "").toUpperCase())
      .filter((t) => AUTHORITY_RECORD_TYPES.includes(t));
    if (offending.length > 0) {
      throw new ServiceError(
        "سجلات السلطة (" + offending.join(", ") + ") مش بتتعدّل من هنا — استخدم الـNameservers",
        C.VALIDATION,
        { types: offending }
      );
    }
    let out;
    try {
      out = await provider.updateDnsRecords({
        name: validateDomain(domain),
        records: records.map((r) => ({ type: r && r.type, name: r && r.name, value: r && r.value, ttl: r && r.ttl })),
      });
    } catch (err) {
      const code = err && err.code ? err.code : null;
      // أخطاء المدخلات تطلع من العميل، مش خطأ مزوّد.
      if (code === "DNS_RECORD_INVALID" || code === "AUTHORITY_RECORD_IMMUTABLE") {
        throw new ServiceError(err.message || "سجل DNS مرفوض", C.VALIDATION, { code });
      }
      throw new ServiceError("فشل تعديل سجلات DNS عند المزوّد", C.PROVIDER_ERROR, { code });
    }
    const kept = Array.isArray(out && out.records) ? out.records : [];
    audit.append({ action: "domain.dns_records_updated", target: domain, actor: claims && claims.sub, detail: { count: kept.length } });
    return Object.freeze({ ok: true, domain, replaced: true, records: kept.map(clientDnsRecord) });
  }

  /* ---------------- تفاصيل الدومين · الأمان · أهلية النقل ---------------- */

  function contactOf(c) {
    if (!c) return null;
    return Object.freeze({
      name: c.name || null,
      email: c.email || null,
      phone: c.phone || null,
      country: c.country || null,
    });
  }

  function clientDomainDetails(d) {
    const locks = Array.isArray(d.locks) ? d.locks.slice() : [];
    return Object.freeze({
      domain: d.name,
      status: d.status || null,
      registeredAt: d.registeredAt || null,
      expiresAt: d.expiresAt || null,
      nameservers: Array.isArray(d.nameservers) ? d.nameservers.slice() : [],
      transferLock: locks.includes(REGISTRY_LOCKS.TRANSFER_PROHIBITED),
      locks,
      dnssec: Boolean(d.dnssec),
      registrant: contactOf(d.registrant),
      contacts: Object.freeze({
        registrant: contactOf(d.registrant),
        admin: contactOf(d.admin),
        tech: contactOf(d.tech),
        billing: contactOf(d.billing),
      }),
    });
  }

  async function getDomain({ domain, claims } = {}) {
    requireOwnedDomainRecord(domain, claims);
    if (typeof provider.getDomainDetails !== "function") throw new ServiceError("المزوّد لا يدعم قراءة تفاصيل الدومين", C.PROVIDER_ERROR);
    const name = validateDomain(domain);
    const d = await provider.getDomainDetails(name);
    return Object.freeze({ ok: true, domain: name, details: clientDomainDetails(d) });
  }

  async function setTransferLock({ domain, locked, claims } = {}) {
    requireOwnedDomainRecord(domain, claims);
    if (typeof provider.setLock !== "function") throw new ServiceError("المزوّد لا يدعم قفل النقل", C.PROVIDER_ERROR);
    const name = validateDomain(domain);
    let out;
    try {
      out = await provider.setLock(name, locked === true);
    } catch (err) {
      throw new ServiceError("فشل تغيير قفل النقل عند المزوّد", C.PROVIDER_ERROR, { code: err && err.code ? err.code : null });
    }
    audit.append({ action: "domain.lock_changed", target: name, actor: claims && claims.sub, detail: { locked: out.locked === true } });
    return Object.freeze({ ok: true, domain: name, locked: out.locked === true, locks: Array.isArray(out.locks) ? out.locks.slice() : [] });
  }

  async function setDnssec({ domain, enabled, claims } = {}) {
    requireOwnedDomainRecord(domain, claims);
    if (typeof provider.setDnssec !== "function") throw new ServiceError("المزوّد لا يدعم DNSSEC", C.PROVIDER_ERROR);
    const name = validateDomain(domain);
    let out;
    try {
      out = await provider.setDnssec(name, enabled === true);
    } catch (err) {
      throw new ServiceError("فشل تغيير DNSSEC عند المزوّد", C.PROVIDER_ERROR, { code: err && err.code ? err.code : null });
    }
    audit.append({ action: "domain.dnssec_changed", target: name, actor: claims && claims.sub, detail: { enabled: out.dnssec === true } });
    return Object.freeze({ ok: true, domain: name, dnssec: out.dnssec === true });
  }

  async function getTransferEligibility({ domain, claims } = {}) {    requireOwnedDomainRecord(domain, claims);
    if (typeof provider.checkTransferEligibility !== "function") {
      throw new ServiceError("المزوّد لا يدعم فحص أهلية النقل", C.PROVIDER_ERROR);
    }
    const name = validateDomain(domain);
    const out = await provider.checkTransferEligibility(name);
    const reasons = Array.isArray(out.reasons)
      ? out.reasons.map((r) => Object.freeze({ code: (r && r.code) || null, message: (r && r.message) || null }))
      : [];
    return Object.freeze({
      ok: true,
      domain: name,
      eligible: out.eligible === true,
      status: out.status || null,
      reasons,
      checkedAt: out.checkedAt || null,
      daysSinceAnchor: Number.isFinite(out.daysSinceAnchor) ? out.daysSinceAnchor : null,
    });
  }

  /**
   * رمز النقل (Auth Code) — سرّي، وبيرجع **بس** لصاحب الدومين عند الطلب.
   * ممنوع يتخزّن في تفاصيل الدومين أو أي استجابة تانية، ومسجّل في التدقيق.
   */
  async function getAuthCode({ domain, claims } = {}) {
    requireOwnedDomainRecord(domain, claims);
    if (typeof provider.getAuthCode !== "function") throw new ServiceError("المزوّد لا يدعم استخراج رمز النقل", C.PROVIDER_ERROR);
    const name = validateDomain(domain);
    const out = await provider.getAuthCode(name);
    audit.append({ action: "domain.auth_code_revealed", target: name, actor: claims && claims.sub, detail: { sensitive: true } });
    return Object.freeze({
      ok: true,
      domain: name,
      authCode: out.authCode || null,
      sensitive: true,
      warning: out.warning || "سرّي: ممنوع يتشارك في مكان عام أو سجل غير محمي",
    });
  }

  /* ---------------- تعديل جهات الاتصال · تجهيز النقل الخارج ---------------- */

  const CONTACT_ROLES = Object.freeze(["registrant", "admin", "tech", "billing"]);

  /** تعديل جهات الاتصال: القرار النهائي عند المزوّد (بيانات الموزّع مرفوضة كمالك). */
  async function updateContacts({ domain, contacts, claims } = {}) {
    requireOwnedDomainRecord(domain, claims);
    if (typeof provider.updateContacts !== "function") {
      throw new ServiceError("المزوّد لا يدعم تعديل جهات الاتصال", C.PROVIDER_ERROR);
    }
    const name = validateDomain(domain);
    const input = {};
    for (const role of CONTACT_ROLES) {
      if (contacts && contacts[role] !== undefined && contacts[role] !== null) input[role] = contacts[role];
    }
    if (Object.keys(input).length === 0) throw new ServiceError("مفيش أي جهة اتصال في الطلب", C.VALIDATION);
    let out;
    try {
      out = await provider.updateContacts({ name, contacts: input });
    } catch (err) {
      const code = err && err.code ? err.code : null;
      if (code === "CONTACT_INVALID" || code === "REGISTRANT_REQUIRED") {
        throw new ServiceError(err.message || "بيانات جهة الاتصال مرفوضة", C.VALIDATION, { code });
      }
      throw new ServiceError("فشل تعديل جهات الاتصال عند المزوّد", C.PROVIDER_ERROR, { code });
    }
    const updatedRoles = Array.isArray(out && out.updatedRoles) ? out.updatedRoles.slice() : Object.keys(input);
    audit.append({ action: "domain.contacts_updated", target: name, actor: claims && claims.sub, detail: { roles: updatedRoles } });
    return Object.freeze({
      ok: true,
      domain: name,
      updatedRoles,
      contacts: Object.freeze({
        registrant: contactOf(out && out.registrant),
        admin: contactOf(out && out.admin),
        tech: contactOf(out && out.tech),
        billing: contactOf(out && out.billing),
      }),
    });
  }

  /**
   * تجهيز النقل الخارج: بيفحص الأهلية عند المزوّد، ولو مؤهّل بيفكّ القفل.
   * **ما بيدّعيش** إن النقل بدأ — النقل بيبدأ من المسجّل المستلم، وبيحتاج
   * رمز النقل من مسار `getAuthCode`. الحالة بترجع READY_TO_TRANSFER أو BLOCKED.
   */
  async function startTransferOut({ domain, claims } = {}) {
    requireOwnedDomainRecord(domain, claims);
    if (typeof provider.checkTransferEligibility !== "function") {
      throw new ServiceError("المزوّد لا يدعم فحص أهلية النقل", C.PROVIDER_ERROR);
    }
    const name = validateDomain(domain);
    const elig = await provider.checkTransferEligibility(name);
    const reasons = Array.isArray(elig && elig.reasons)
      ? elig.reasons.map((r) => Object.freeze({ code: (r && r.code) || null, message: (r && r.message) || null }))
      : [];
    if (!elig || elig.eligible !== true) {
      audit.append({
        action: "domain.transfer_out_blocked",
        outcome: "error",
        target: name,
        actor: claims && claims.sub,
        detail: { reasons: reasons.map((r) => r.code) },
      });
      return Object.freeze({ ok: true, domain: name, status: "BLOCKED", eligible: false, reasons });
    }
    let unlocked = false;
    if (typeof provider.setLock === "function" && typeof provider.getDomainDetails === "function") {
      const details = await provider.getDomainDetails(name);
      const locks = Array.isArray(details && details.locks) ? details.locks : [];
      if (locks.includes(REGISTRY_LOCKS.TRANSFER_PROHIBITED)) {
        await provider.setLock(name, false);
        unlocked = true;
      }
    }
    audit.append({ action: "domain.transfer_out_prepared", target: name, actor: claims && claims.sub, detail: { unlocked } });
    return Object.freeze({
      ok: true,
      domain: name,
      status: "READY_TO_TRANSFER",
      eligible: true,
      unlocked,
      authCodeRequired: true,
      note: "النقل بيبدأ من المسجّل المستلم، وبيحتاج رمز النقل من تبويب الأمان. الحالة بتفضل جاهزة لحد ما المستلم يبدأ الطلب.",
    });
  }

  return {
    search,
    checkAvailability,
    quote,
    previewPrice,
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
    getDnsRecords,
    updateDnsRecords,
    getDomain,
    setTransferLock,
    setDnssec,
    getTransferEligibility,
    getAuthCode,
    updateContacts,
    startTransferOut,
    audit,
    idempotency,
    authz,
    _orders: orders,
  };
}
