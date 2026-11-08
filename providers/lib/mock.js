/* ==========================================================================
   Migo Domains — Mock Provider
   --------------------------------------------------------------------------
   مزوّد وهمي كامل الوظائف للاختبار المحلي. **ما بيتصلش بأي شبكة إطلاقًا،
   وما بيسجّلش أي دومين حقيقي.** كل رد فيه `mock: true`.

   ليه؟ عشان نبني ونختبر كل تدفق التسجيل والتجديد والنقل وDNS من غير أي
   حساب مزوّد، ومن غير أي رسوم. راجع قرار C: فتح حساب Openprovider يحتاج
   موافقة منفصلة.

   التصميم:
   • كل الحالة في الذاكرة، وبتتبني من بذرة (seed) عشان النتايج تتكرر.
   • مفيش عشوائية في المسار العادي — العشوائية بس في توليد المعرّفات.
   • حقن الأعطال صريح (failNext / failAlways / setOutage) بدل مفاجآت.
   • الأهلية **تُحسب** مش تتخزّن (docs/phase-zero/DOMAIN_LIFECYCLE.md).
   • Auth Code بيطلع من دالة تانية لوحده، ومش بيظهر في تفاصيل الدومين.
   ========================================================================== */

import { ProviderError, CapabilityError, TransferEligibilityError, PROVIDER_ERROR_CODES } from "./errors.js";
import {
  AVAILABILITY_STATES,
  DOMAIN_STATUSES,
  REGISTRY_LOCKS,
  TRANSFER_RULES,
  TRANSFER_REASON_CODES,
} from "./states.js";

/* --------------------------------------------------------------------------
   ثوابت
   -------------------------------------------------------------------------- */

const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_MS = 365 * DAY_MS;

/** نافذة السماح بعد الانتهاء (تقريب لمراحل دورة الحياة). */
const GRACE = Object.freeze({ EXPIRED_DAYS: 30, REDEMPTION_DAYS: 70 });

const RECORD_TYPES = Object.freeze(["A", "AAAA", "CNAME", "MX", "TXT", "CAA", "NS"]);
const AUTHORITY_TYPES = Object.freeze(["NS", "CAA"]);

/**
 * قائمة أسعار **وهمية بالكامل**. مش أسعار Openprovider ولا أي مزوّد حقيقي،
 * وممنوع تُستخدم كسعر بيع أو كتكلفة في أي قرار. الغرض اختبار المنطق بس.
 */
export const MOCK_PRICE_LIST = Object.freeze({
  com: { registration: ["8.49", "0.18"], renewal: ["9.20", "0.18"], transfer: ["8.99", "0.18"] },
  net: { registration: ["9.10", "0.18"], renewal: ["9.85", "0.18"], transfer: ["9.40", "0.18"] },
  org: { registration: ["9.80", "0.20"], renewal: ["10.60", "0.20"], transfer: ["10.10", "0.20"] },
  dev: { registration: ["12.00", "0.25"], renewal: ["12.90", "0.25"], transfer: ["12.40", "0.25"] },
  app: { registration: ["13.50", "0.25"], renewal: ["14.40", "0.25"], transfer: ["13.90", "0.25"] },
  io: { registration: ["32.00", "0.40"], renewal: ["34.50", "0.40"], transfer: ["33.00", "0.40"] },
  store: { registration: ["45.00", "0.50"], renewal: ["47.00", "0.50"], transfer: ["46.00", "0.50"] },
});

/** دومينات محجوزة/مميّزة في عالم الوهم — لاختبار الحالات كلها. */
const DEFAULT_RESERVED = ["example.org", "migo.eg", "test.com"];
const DEFAULT_PREMIUM = ["premium.io", "gold.store", "ai.app"];

/* --------------------------------------------------------------------------
   أدوات داخلية
   -------------------------------------------------------------------------- */

/** مقياس عشوائية حتمي (xorshift32) — نفس البذرة = نفس النتايج. */
function makeRandom(seed) {
  let x = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i += 1) {
    x ^= s.charCodeAt(i);
    x = Math.imul(x, 16777619);
  }
  x = x >>> 0 || 1;
  return function next() {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

const HEX = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** يحلّل الاسم: يرجع { name, sld, tld } أو يرمي. */
function parseDomain(input) {
  if (typeof input !== "string") {
    throw new ProviderError("اسم الدومين لازم يكون نص", PROVIDER_ERROR_CODES.DOMAIN_INVALID);
  }
  const name = input.trim().toLowerCase();
  const ascii = /^[a-z0-9.-]+$/.test(name);
  const shape = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(name);
  if (!ascii || !shape || name.includes("..")) {
    throw new ProviderError("اسم دومين غير صحيح: " + input, PROVIDER_ERROR_CODES.DOMAIN_INVALID, {
      domain: input,
    });
  }
  const parts = name.split(".");
  const tld = parts.slice(1).join(".");
  return { name, sld: parts[0], tld };
}

function requireStrings(list, what, code) {
  if (!Array.isArray(list) || list.length === 0) {
    throw new ProviderError(what + " فاضية", code);
  }
  for (const v of list) {
    if (typeof v !== "string" || v.trim() === "") {
      throw new ProviderError(what + " فيها قيمة غير صحيحة", code, { value: v });
    }
  }
  return true;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** IPv4 صحيح: أربع خانات، كل واحدة 0-255 بدون أصفار بادئة. */
function isIPv4(value) {
  const parts = String(value).split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^(0|[1-9]\d{0,2})$/.test(p) && Number(p) <= 255);
}

function freezeDeep(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

/* --------------------------------------------------------------------------
   المصنع
   -------------------------------------------------------------------------- */

/**
 * ينشئ مزوّدًا وهميًا.
 * @param {object} [options]
 * @param {string|number} [options.seed]      بذرة التوليد (للثبات).
 * @param {object} [options.priceList]        أسعار وهمية بديلة.
 * @param {string[]} [options.reserved]
 * @param {string[]} [options.premium]
 * @param {number|string[]} [options.unknownTlds] امتدادات تحاكي مصدر لا يستجيب.
 * @param {string[]} [options.resellerContacts] بيانات الموزّع الممنوعة كمالك.
 * @param {function} [options.now]            مصدر الوقت (للاختبار).
 */
export function createMockProvider(options = {}) {
  const {
    seed = "migo-mock-2026",
    priceList = MOCK_PRICE_LIST,
    reserved = DEFAULT_RESERVED,
    premium = DEFAULT_PREMIUM,
    unknownTlds = [],
    resellerContacts = ["migo", "naroelwakel"],
    now = () => new Date(),
  } = options;

  const random = makeRandom(seed);
  const store = new Map();
  const idempotency = new Map();
  const transfers = new Map();
  const reservedSet = new Set(reserved.map((d) => d.toLowerCase()));
  const premiumSet = new Set(premium.map((d) => d.toLowerCase()));
  const unknownSet = new Set(
    (Array.isArray(unknownTlds) ? unknownTlds : [unknownTlds]).map((t) => String(t).toLowerCase())
  );
  const resellerTokens = resellerContacts.map((r) => String(r).toLowerCase());
  const failures = new Map();
  let outage = null;
  let counter = 0;

  const clock = () => (now() instanceof Date ? now() : new Date(now()));
  const source = "mock:price-list@" + String(seed);

  function nextId(prefix) {
    counter += 1;
    return prefix + "-" + counter.toString().padStart(4, "0");
  }

  function nextAuthCode() {
    let out = "";
    for (let i = 0; i < 16; i += 1) out += HEX[Math.floor(random() * HEX.length)];
    return out;
  }

  /** حقن عطل — صريح ومحدود. */
  function failNext(method, spec = {}) {
    const entry = failures.get(method) || { queue: [] };
    entry.queue.push({
      code: spec.code || PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE,
      message: spec.message || "المزوّد مش متاح (عطل محقون للاختبار)",
      detail: spec.detail,
    });
    failures.set(method, entry);
  }

  function failAlways(method, spec = {}) {
    const entry = failures.get(method) || { queue: [] };
    entry.always = {
      code: spec.code || PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE,
      message: spec.message || "المزوّد مش متاح (عطل محقون دائم)",
      detail: spec.detail,
    };
    failures.set(method, entry);
  }

  /** انقطاع كامل: كل نداء يفشل. */
  function setOutage(on, spec = {}) {
    outage = on
      ? { code: spec.code || PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE, message: spec.message || "انقطاع كامل (محقون للاختبار)" }
      : null;
  }

  function clearFailures() {
    failures.clear();
    outage = null;
  }

  function trip(method) {
    if (outage) throw new ProviderError(outage.message, outage.code, { method });
    const entry = failures.get(method);
    if (!entry) return;
    if (entry.queue.length > 0) {
      const f = entry.queue.shift();
      throw new ProviderError(f.message, f.code, { method, ...(f.detail ? { detail: f.detail } : {}) });
    }
    if (entry.always) throw new ProviderError(entry.always.message, entry.always.code, { method });
  }

  function priceFor(tld) {
    return priceList[tld] || null;
  }

  function resolveTld(name) {
    const parts = name.split(".");
    for (let i = 1; i < parts.length; i += 1) {
      const candidate = parts.slice(i).join(".");
      if (priceList[candidate]) return candidate;
    }
    return parts[parts.length - 1];
  }

  /** يحسب الحالة من التواريخ — النقل/الانتهاء مش مخزّنين كحالة أساسية. */
  function deriveStatus(record) {
    if (record.status === DOMAIN_STATUSES.TRANSFER_PENDING) return record.status;
    const t = clock().getTime();
    const expires = new Date(record.expiresAt).getTime();
    if (t <= expires) return DOMAIN_STATUSES.ACTIVE;
    const days = (t - expires) / DAY_MS;
    if (days <= GRACE.EXPIRED_DAYS) return DOMAIN_STATUSES.EXPIRED;
    if (days <= GRACE.REDEMPTION_DAYS) return DOMAIN_STATUSES.REDEMPTION_PERIOD;
    return DOMAIN_STATUSES.PENDING_DELETE;
  }

  function requireRecord(input) {
    const { name } = parseDomain(input);
    const record = store.get(name);
    if (!record) {
      throw new ProviderError("الدومين مش موجود في حساب المزوّد: " + name, PROVIDER_ERROR_CODES.DOMAIN_NOT_FOUND, {
        domain: name,
      });
    }
    return record;
  }

  /**
   * إعادة تشغيل آمنة: نفس المفتاح + نفس الطلب = نفس النتيجة بدون تكرار.
   * نفس المفتاح + طلب مختلف = خطأ صريح (مش تنفيذ تاني بالغلط).
   */
  function lookupIdempotency(key, fingerprint) {
    if (!key) return null;
    const existing = idempotency.get(key);
    if (!existing) return null;
    if (existing.fingerprint !== fingerprint) {
      throw new ProviderError(
        "نفس مفتاح الـIdempotency استُخدم بطلب مختلف",
        PROVIDER_ERROR_CODES.IDEMPOTENCY_CONFLICT,
        { key }
      );
    }
    return existing.result;
  }

  function saveIdempotency(key, fingerprint, result) {
    if (!key) return;
    idempotency.set(key, { fingerprint, result });
  }

  function ensureContact(contact, role) {
    if (!contact || typeof contact !== "object") {
      throw new ProviderError("بيانات المالك مطلوبة (" + role + ")", PROVIDER_ERROR_CODES.REGISTRANT_REQUIRED);
    }
    const name = String(contact.name || "").trim();
    const email = String(contact.email || "").trim().toLowerCase();
    if (!name || !email) {
      throw new ProviderError(
        "بيانات المالك ناقصة: لازم اسم وبريد",
        PROVIDER_ERROR_CODES.CONTACT_INVALID,
        { role }
      );
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new ProviderError("بريد المالك غير صحيح: " + email, PROVIDER_ERROR_CODES.CONTACT_INVALID, { role });
    }
    const haystack = (name + " " + email).toLowerCase();
    if (resellerTokens.some((token) => haystack.includes(token))) {
      throw new ProviderError(
        "بيانات الموزّع (Migo) ممنوعة كمالك رسمي — الملكية لازم تكون للعميل الفعلي",
        PROVIDER_ERROR_CODES.REGISTRANT_REQUIRED,
        { role, rule: "PER_DOMAIN_REGISTRANT" }
      );
    }
    return { name, email, ...clone(contact) };
  }

  /* ------------------------------------------------------------------------
     القدرات
     ------------------------------------------------------------------------ */
  function capabilities() {
    return Object.freeze({
      register: true,
      renew: true,
      restore: true,
      transferIn: true,
      transferOut: true,
      contactsUpdate: true,
      nameservers: true,
      dns: true,
      authCode: true,
      locks: true,
      dnssec: true,
      /** تمرير مالك مختلف لكل دومين — شرط إلزامي من قرار المزوّد. */
      perDomainRegistrant: true,
    });
  }

  function requireCapability(capability, methodName) {
    if (capabilities()[capability] === false) {
      throw new CapabilityError(capability, "المزوّد الوهمي ما بيدعمش " + capability + " (" + methodName + ")");
    }
  }

  /* ------------------------------------------------------------------------
     1) التحقق من التوفر
     ------------------------------------------------------------------------ */
  function checkAvailability(input) {
    trip("checkAvailability");
    const { name } = parseDomain(input);
    const tld = resolveTld(name);

    if (store.has(name)) {
      const rec = store.get(name);
      return freezeDeep({
        mock: true,
        name,
        tld,
        state: AVAILABILITY_STATES.REGISTERED,
        definitive: true,
        detail: { status: deriveStatus(rec), registeredAt: rec.createdAt },
        source,
        checkedAt: clock().toISOString(),
      });
    }
    if (reservedSet.has(name)) {
      return freezeDeep({
        mock: true, name, tld, state: AVAILABILITY_STATES.RESERVED, definitive: true,
        reason: "RESERVED", source, checkedAt: clock().toISOString(),
      });
    }
    if (premiumSet.has(name)) {
      return freezeDeep({
        mock: true, name, tld, state: AVAILABILITY_STATES.PREMIUM, definitive: true,
        reason: "PREMIUM", source, checkedAt: clock().toISOString(),
      });
    }
    if (unknownSet.has(tld)) {
      return freezeDeep({
        mock: true, name, tld, state: AVAILABILITY_STATES.UNKNOWN, definitive: false,
        reason: "SOURCE_NOT_RESPONDING", source, checkedAt: clock().toISOString(),
      });
    }
    if (!priceFor(tld)) {
      return freezeDeep({
        mock: true, name, tld, state: AVAILABILITY_STATES.RESTRICTED, definitive: false,
        reason: PROVIDER_ERROR_CODES.TLD_NOT_SUPPORTED, source, checkedAt: clock().toISOString(),
      });
    }
    return freezeDeep({
      mock: true, name, tld, state: AVAILABILITY_STATES.AVAILABLE_CONFIRMED, definitive: true,
      source, checkedAt: clock().toISOString(),
    });
  }

  /* ------------------------------------------------------------------------
     2) التسعير (تكلفة المورّد — مش سعر بيع)
     ------------------------------------------------------------------------ */
  function getPricing(input, { operation = "registration" } = {}) {
    trip("getPricing");
    const { name } = parseDomain(input);
    const tld = resolveTld(name);
    const row = priceFor(tld);
    if (!row) {
      throw new ProviderError("امتداد غير مدعوم: " + tld, PROVIDER_ERROR_CODES.TLD_NOT_SUPPORTED, { tld });
    }
    const pair = row[operation];
    if (!pair) {
      throw new ProviderError("عملية غير مسعّرة: " + operation, PROVIDER_ERROR_CODES.TLD_NOT_SUPPORTED, { operation });
    }
    return freezeDeep({
      mock: true,
      name,
      tld,
      operation,
      currency: "USD",
      wholesaleUsd: pair[0],
      feesUsd: pair[1],
      premium: premiumSet.has(name),
      /** التنبيه: دي أسعار وهمية للاختبار، وممنوعة كسعر حقيقي. */
      fake: true,
      source,
      retrievedAt: clock().toISOString(),
    });
  }

  /* ------------------------------------------------------------------------
     3) التسجيل
     ------------------------------------------------------------------------ */
  function registerDomain(input = {}) {
    trip("registerDomain");
    requireCapability("register", "registerDomain");
    const { name, tld } = parseDomain(input.name);
    const years = input.years === undefined ? 1 : Number(input.years);

    if (!Number.isInteger(years) || years < 1 || years > 10) {
      throw new ProviderError("عدد سنوات التسجيل لازم يكون من 1 لـ10", PROVIDER_ERROR_CODES.DOMAIN_INVALID, { years });
    }
    if (!priceFor(tld)) {
      throw new ProviderError("امتداد غير مدعوم: " + tld, PROVIDER_ERROR_CODES.TLD_NOT_SUPPORTED, { tld });
    }

    // الملكية: المالك إلزامي، وبيانات الموزّع ممنوعة.
    const registrant = ensureContact(input.registrant, "registrant");
    const admin = input.admin ? ensureContact(input.admin, "admin") : registrant;
    const tech = input.tech ? ensureContact(input.tech, "tech") : registrant;
    const billing = input.billing ? ensureContact(input.billing, "billing") : registrant;

    // إعادة التشغيل بتتفحص **قبل** فحوص الحالة، عشان نفس الطلب يرجّع نفس النتيجة.
    const fingerprint = JSON.stringify({ name, years, op: "register", registrant: registrant.email });
    const replay = lookupIdempotency(input.idempotencyKey, fingerprint);
    if (replay) return replay;

    if (store.has(name)) {
      throw new ProviderError("الدومين مسجّل بالفعل: " + name, PROVIDER_ERROR_CODES.DOMAIN_ALREADY_REGISTERED, { domain: name });
    }
    if (reservedSet.has(name)) {
      throw new ProviderError("الدومين محجوز: " + name, PROVIDER_ERROR_CODES.DOMAIN_NOT_ACTIVE, { domain: name });
    }

    const nameservers = Array.isArray(input.nameservers) && input.nameservers.length > 0
      ? validateNameservers(input.nameservers)
      : ["ns1.migo-dns.test", "ns2.migo-dns.test"];

    const at = clock();
    const record = {
      name,
      tld,
      status: DOMAIN_STATUSES.ACTIVE,
      registrant,
      admin,
      tech,
      billing,
      createdAt: at.toISOString(),
      expiresAt: new Date(at.getTime() + years * YEAR_MS).toISOString(),
      nameservers,
      dnsRecords: nameservers.map((ns, i) => ({
        id: nextId("rec") + "-ns" + i,
        type: "NS",
        name: "@",
        value: ns,
        ttl: 3600,
        authority: true,
      })),
      locks: [REGISTRY_LOCKS.TRANSFER_PROHIBITED],
      dnssec: false,
      authCode: nextAuthCode(),
      providerId: nextId("dom"),
      lastTransferAt: null,
      transferredOut: false,
    };
    store.set(name, record);

    const result = freezeDeep({
      mock: true,
      name,
      status: record.status,
      registeredAt: record.createdAt,
      expiresAt: record.expiresAt,
      nameservers: record.nameservers,
      registrantOwned: true,
      providerId: record.providerId,
      years,
      source,
    });
    saveIdempotency(input.idempotencyKey, fingerprint, result);
    return result;
  }

  /* ------------------------------------------------------------------------
     4) التجديد
     ------------------------------------------------------------------------ */
  function renewDomain(input = {}) {
    trip("renewDomain");
    requireCapability("renew", "renewDomain");
    const record = requireRecord(input.name);
    const years = input.years === undefined ? 1 : Number(input.years);
    if (!Number.isInteger(years) || years < 1 || years > 10) {
      throw new ProviderError("عدد سنوات التجديد لازم يكون من 1 لـ10", PROVIDER_ERROR_CODES.DOMAIN_INVALID, { years });
    }
    const status = deriveStatus(record);
    if (status === DOMAIN_STATUSES.PENDING_DELETE) {
      throw new ProviderError(
        "الدومين في مرحلة الحذف النهائي — لازم استرداد مش تجديد",
        PROVIDER_ERROR_CODES.DOMAIN_NOT_ACTIVE,
        { domain: record.name, status }
      );
    }

    const fingerprint = JSON.stringify({ name: record.name, years, op: "renew" });
    const replay = lookupIdempotency(input.idempotencyKey, fingerprint);
    if (replay) return replay;

    const base = Math.max(new Date(record.expiresAt).getTime(), clock().getTime());
    const previous = record.expiresAt;
    record.expiresAt = new Date(base + years * YEAR_MS).toISOString();

    const result = freezeDeep({
      mock: true,
      name: record.name,
      status: deriveStatus(record),
      previousExpiresAt: previous,
      expiresAt: record.expiresAt,
      years,
      extendedByMs: years * YEAR_MS,
      source,
    });
    saveIdempotency(input.idempotencyKey, fingerprint, result);
    return result;
  }

  /* ------------------------------------------------------------------------
     5) النقل
     ------------------------------------------------------------------------ */
  function transferDomain(input = {}) {
    trip("transferDomain");
    requireCapability("transferIn", "transferDomain");
    const record = requireRecord(input.name);

    // إعادة التشغيل أولًا: نفس طلب النقل يرجّع نفس النتيجة بدون بدء نقل تاني.
    const fingerprint = JSON.stringify({ name: record.name, op: "transfer" });
    const replay = lookupIdempotency(input.idempotencyKey, fingerprint);
    if (replay) return replay;

    const status = deriveStatus(record);

    if (status === DOMAIN_STATUSES.TRANSFER_PENDING) {
      throw new ProviderError("فيه نقل جارٍ بالفعل", PROVIDER_ERROR_CODES.TRANSFER_ALREADY_PENDING, { domain: record.name });
    }
    if (input.authCode === undefined || input.authCode === null || String(input.authCode).trim() === "") {
      throw new ProviderError("رمز النقل (Auth Code) مطلوب", PROVIDER_ERROR_CODES.AUTH_CODE_REQUIRED, { domain: record.name });
    }
    if (String(input.authCode) !== record.authCode) {
      throw new ProviderError("رمز النقل غير صحيح", PROVIDER_ERROR_CODES.AUTH_CODE_INVALID, { domain: record.name });
    }
    if (input.registrant !== undefined) ensureContact(input.registrant, "registrant");

    // الأهلية تُحسب قبل أي تنفيذ — وقواعد ICANN بتفضل هي الحاكم.
    const eligibility = checkTransferEligibility(record.name);
    if (!eligibility.eligible) {
      throw new TransferEligibilityError(eligibility.reasons);
    }

    const transferId = nextId("tr");
    transfers.set(transferId, { transferId, name: record.name, status: DOMAIN_STATUSES.TRANSFER_PENDING });
    record.status = DOMAIN_STATUSES.TRANSFER_PENDING;

    const result = freezeDeep({
      mock: true,
      name: record.name,
      transferId,
      status: DOMAIN_STATUSES.TRANSFER_PENDING,
      note: "النقل غير مكتمل — لازم تأكيد المزوّد، وممنوع اعتباره منتهيًا قبله",
      source,
    });
    saveIdempotency(input.idempotencyKey, fingerprint, result);
    return result;
  }

  /** يحاكي نتيجة النقل من المزوّد (async). */
  function simulateTransferOutcome(transferId, outcome = "completed") {
    trip("simulateTransferOutcome");
    const t = transfers.get(transferId);
    if (!t) {
      throw new ProviderError("طلب نقل غير موجود: " + transferId, PROVIDER_ERROR_CODES.DOMAIN_NOT_FOUND, { transferId });
    }
    if (t.status !== DOMAIN_STATUSES.TRANSFER_PENDING) {
      throw new ProviderError("طلب النقل مش في حالة انتظار", PROVIDER_ERROR_CODES.DOMAIN_NOT_ACTIVE, { transferId });
    }
    const record = store.get(t.name);
    if (outcome === "completed") {
      t.status = DOMAIN_STATUSES.TRANSFER_COMPLETED;
      record.status = DOMAIN_STATUSES.ACTIVE;
      record.lastTransferAt = clock().toISOString();
      const base = Math.max(new Date(record.expiresAt).getTime(), clock().getTime());
      record.expiresAt = new Date(base + YEAR_MS).toISOString();
    } else {
      t.status = DOMAIN_STATUSES.TRANSFER_FAILED;
      record.status = DOMAIN_STATUSES.ACTIVE;
    }
    return freezeDeep({ mock: true, transferId, name: record.name, status: t.status, source });
  }

  /**
   * أهلية النقل — **محسوبة** لحظيًا، مش حالة مخزّنة.
   * المصدر: docs/phase-zero/DOMAIN_LIFECYCLE.md.
   */
  function checkTransferEligibility(input, { asOf } = {}) {
    const record = requireRecord(input);
    const at = asOf ? new Date(asOf) : clock();
    const reasons = [];
    const status = deriveStatus(record);

    if (record.transferredOut) {
      reasons.push({ code: TRANSFER_REASON_CODES.BAD_STATUS, message: "الدومين منقول خارجيًا بالفعل" });
    }
    if ([DOMAIN_STATUSES.REDEMPTION_PERIOD, DOMAIN_STATUSES.PENDING_DELETE].includes(status)) {
      reasons.push({ code: TRANSFER_REASON_CODES.BAD_STATUS, message: "الدومين في " + status + " — النقل ممنوع" });
    }
    if (record.locks.includes(REGISTRY_LOCKS.TRANSFER_PROHIBITED)) {
      reasons.push({ code: TRANSFER_REASON_CODES.TRANSFER_LOCKED, message: "قفل النقل مفعّل (clientTransferProhibited)" });
    }
    if (record.locks.includes(REGISTRY_LOCKS.HOLD) || record.locks.includes(REGISTRY_LOCKS.SERVER_HOLD)) {
      reasons.push({ code: TRANSFER_REASON_CODES.BAD_STATUS, message: "الدومين موقوف (Hold)" });
    }
    if (record.dnssec) {
      reasons.push({ code: TRANSFER_REASON_CODES.DNSSEC_ACTIVE, message: "DNSSEC مفعّل — لازم يتقفل قبل النقل" });
    }
    const anchor = record.lastTransferAt || record.createdAt;
    const days = (at.getTime() - new Date(anchor).getTime()) / DAY_MS;
    if (days < TRANSFER_RULES.LOCK_WINDOW_DAYS) {
      reasons.push({
        code: TRANSFER_REASON_CODES.WITHIN_60_DAYS,
        message: "لسه ما مرّوش 60 يوم من " + (record.lastTransferAt ? "آخر نقل" : "التسجيل"),
      });
    }

    return freezeDeep({
      mock: true,
      name: record.name,
      status,
      eligible: reasons.length === 0,
      reasons,
      checkedAt: at.toISOString(),
      daysSinceAnchor: Math.floor(days),
      note: "الأهلية محسوبة من الحالة والقواعد، ومش حالة أساسية",
    });
  }

  /* ------------------------------------------------------------------------
     6) تفاصيل الدومين — **بدون** Auth Code
     ------------------------------------------------------------------------ */
  function getDomainDetails(input) {
    trip("getDomainDetails");
    const record = requireRecord(input);
    return freezeDeep({
      mock: true,
      name: record.name,
      tld: record.tld,
      status: deriveStatus(record),
      registrant: clone(record.registrant),
      admin: clone(record.admin),
      tech: clone(record.tech),
      billing: clone(record.billing),
      registeredAt: record.createdAt,
      expiresAt: record.expiresAt,
      nameservers: [...record.nameservers],
      locks: [...record.locks],
      dnssec: record.dnssec,
      providerId: record.providerId,
      lastTransferAt: record.lastTransferAt,
      /** تنبيه أمني: رمز النقل ما بيظهرش هنا — له دالة خاصة. */
      authCodeIncluded: false,
      source,
    });
  }

  /** رمز النقل (سرّي) — دالة مستقلة عن التفاصيل. */
  function getAuthCode(input) {
    trip("getAuthCode");
    const record = requireRecord(input);
    return freezeDeep({
      mock: true,
      name: record.name,
      authCode: record.authCode,
      sensitive: true,
      warning: "سرّي: ممنوع يظهر في رابط عام أو سجل غير محمي، وممنوع للعميل غير المالك",
      source,
    });
  }

  function setLock(input, locked = true) {
    trip("setLock");
    requireCapability("locks", "setLock");
    const record = requireRecord(input);
    const next = new Set(record.locks);
    if (locked) next.add(REGISTRY_LOCKS.TRANSFER_PROHIBITED);
    else next.delete(REGISTRY_LOCKS.TRANSFER_PROHIBITED);
    record.locks = [...next];
    return freezeDeep({ mock: true, name: record.name, locked: Boolean(locked), locks: [...record.locks], source });
  }

  function setDnssec(input, enabled) {
    trip("setDnssec");
    const record = requireRecord(input);
    record.dnssec = Boolean(enabled);
    return freezeDeep({ mock: true, name: record.name, dnssec: record.dnssec, source });
  }

  /* ------------------------------------------------------------------------
     7) الـNameservers
     ------------------------------------------------------------------------ */
  function validateNameservers(list) {
    requireStrings(list, "قائمة الـNameservers", PROVIDER_ERROR_CODES.NAMESERVER_INVALID);
    if (list.length < 2 || list.length > 6) {
      throw new ProviderError("عدد الـNameservers لازم يكون من 2 لـ6", PROVIDER_ERROR_CODES.NAMESERVER_INVALID, {
        count: list.length,
      });
    }
    for (const ns of list) {
      const host = ns.trim().toLowerCase();
      if (!/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(host)) {
        throw new ProviderError("اسم nameserver غير صحيح: " + ns, PROVIDER_ERROR_CODES.NAMESERVER_INVALID, { ns });
      }
    }
    return list.map((ns) => ns.trim().toLowerCase());
  }

  function updateNameservers(input = {}) {
    trip("updateNameservers");
    requireCapability("nameservers", "updateNameservers");
    const record = requireRecord(input.name);
    const list = validateNameservers(input.nameservers);
    const previous = [...record.nameservers];
    record.nameservers = list;
    return freezeDeep({ mock: true, name: record.name, previous, nameservers: [...list], source });
  }

  /* ------------------------------------------------------------------------
     8) سجلات DNS
     ------------------------------------------------------------------------ */
  function validateRecord(rec) {
    if (!rec || typeof rec !== "object") {
      throw new ProviderError("سجل DNS غير صحيح", PROVIDER_ERROR_CODES.DNS_RECORD_INVALID);
    }
    const type = String(rec.type || "").toUpperCase();
    if (!RECORD_TYPES.includes(type)) {
      throw new ProviderError("نوع سجل غير مدعوم: " + rec.type, PROVIDER_ERROR_CODES.DNS_RECORD_INVALID, { type: rec.type });
    }
    const name = String(rec.name ?? "@").trim();
    const value = String(rec.value ?? "").trim();
    if (!value) {
      throw new ProviderError("قيمة السجل مطلوبة", PROVIDER_ERROR_CODES.DNS_RECORD_INVALID, { type });
    }
    const ttl = rec.ttl === undefined ? 3600 : Number(rec.ttl);
    if (!Number.isInteger(ttl) || ttl < 60 || ttl > 86400) {
      throw new ProviderError("TTL لازم يكون من 60 لـ86400", PROVIDER_ERROR_CODES.DNS_RECORD_INVALID, { ttl: rec.ttl });
    }
    if (type === "A" && !isIPv4(value)) {
      throw new ProviderError("عنوان A غير صحيح: " + value, PROVIDER_ERROR_CODES.DNS_RECORD_INVALID, { value });
    }
    if (type === "AAAA" && !/^[0-9a-fA-F:]+$/.test(value)) {
      throw new ProviderError("عنوان AAAA غير صحيح: " + value, PROVIDER_ERROR_CODES.DNS_RECORD_INVALID, { value });
    }
    return { type, name, value, ttl };
  }

  function getDnsRecords(input) {
    trip("getDnsRecords");
    const record = requireRecord(input);
    return freezeDeep({ mock: true, name: record.name, records: clone(record.dnsRecords), source });
  }

  /**
   * تحديث سجلات الـzone.
   * **مهم:** ده **استبدال كامل** للـzone مش إضافة سجل — نفس تحذير
   * `setHosts` عند Namecheap في docs/phase-zero/DNS_ARCHITECTURE.md.
   */
  function updateDnsRecords(input = {}) {
    trip("updateDnsRecords");
    requireCapability("dns", "updateDnsRecords");
    const record = requireRecord(input.name);
    if (!Array.isArray(input.records)) {
      throw new ProviderError("سجلات DNS لازم تكون قائمة", PROVIDER_ERROR_CODES.DNS_RECORD_INVALID);
    }
    const validated = input.records.map(validateRecord);

    // سجلات السلطة (NS/CAA) لا تُعدّل من هنا.
    const offending = validated.filter((r) => AUTHORITY_TYPES.includes(r.type));
    if (offending.length > 0) {
      throw new ProviderError(
        "سجلات السلطة (" + offending.map((r) => r.type).join(", ") + ") مش بتتعدّل من هنا — استخدم updateNameservers",
        PROVIDER_ERROR_CODES.AUTHORITY_RECORD_IMMUTABLE,
        { types: offending.map((r) => r.type) }
      );
    }

    const kept = record.dnsRecords.filter((r) => r.authority);
    record.dnsRecords = [...kept, ...validated.map((r) => ({ id: nextId("rec"), ...r, authority: false }))];
    return freezeDeep({
      mock: true,
      name: record.name,
      replaced: true,
      records: clone(record.dnsRecords),
      note: "الاستبدال كامل: أي سجل غير موجود في الطلب اتشال",
      source,
    });
  }

  function deleteDnsRecord(input = {}) {
    trip("deleteDnsRecord");
    const record = requireRecord(input.name);
    const index = record.dnsRecords.findIndex((r) => r.id === input.recordId);
    if (index === -1) {
      throw new ProviderError("سجل DNS غير موجود: " + input.recordId, PROVIDER_ERROR_CODES.DNS_RECORD_NOT_FOUND, {
        recordId: input.recordId,
      });
    }
    if (record.dnsRecords[index].authority) {
      throw new ProviderError(
        "سجل سلطة مش بيتحذف من هنا",
        PROVIDER_ERROR_CODES.AUTHORITY_RECORD_IMMUTABLE,
        { recordId: input.recordId }
      );
    }
    const [removed] = record.dnsRecords.splice(index, 1);
    return freezeDeep({ mock: true, name: record.name, removed: { ...removed }, source });
  }

  /* ------------------------------------------------------------------------
     9) تاريخ الانتهاء
     ------------------------------------------------------------------------ */
  function getDomainExpiration(input) {
    trip("getDomainExpiration");
    const record = requireRecord(input);
    const status = deriveStatus(record);
    const expires = new Date(record.expiresAt).getTime();
    return freezeDeep({
      mock: true,
      name: record.name,
      status,
      expiresAt: record.expiresAt,
      daysRemaining: Math.ceil((expires - clock().getTime()) / DAY_MS),
      gracePeriod: [DOMAIN_STATUSES.EXPIRED, DOMAIN_STATUSES.REDEMPTION_PERIOD].includes(status),
      source,
    });
  }

  /* ------------------------------------------------------------------------
     أدوات الاختبار
     ------------------------------------------------------------------------ */
  function seedDomain(name, over = {}) {
    const parsed = parseDomain(name);
    const at = new Date(over.registeredAt || clock().getTime() - 400 * DAY_MS);
    const record = {
      name: parsed.name,
      tld: resolveTld(parsed.name),
      status: DOMAIN_STATUSES.ACTIVE,
      registrant: { name: over.registrantName || "عميل تجريبي", email: over.registrantEmail || "owner@example.test" },
      admin: null,
      tech: null,
      billing: null,
      createdAt: at.toISOString(),
      expiresAt: new Date(at.getTime() + (over.years || 1) * YEAR_MS).toISOString(),
      nameservers: over.nameservers || ["ns1.migo-dns.test", "ns2.migo-dns.test"],
      dnsRecords: [],
      locks: over.locks ? [...over.locks] : [],
      dnssec: Boolean(over.dnssec),
      authCode: over.authCode || nextAuthCode(),
      providerId: nextId("dom"),
      lastTransferAt: over.lastTransferAt || null,
      transferredOut: Boolean(over.transferredOut),
    };
    record.admin = record.registrant;
    record.tech = record.registrant;
    record.billing = record.registrant;
    store.set(parsed.name, record);
    return getDomainDetails(parsed.name);
  }

  function reset() {
    store.clear();
    idempotency.clear();
    transfers.clear();
    clearFailures();
    counter = 0;
  }

  function stats() {
    return { domains: store.size, transfers: transfers.size, failuresInjected: failures.size, outage: Boolean(outage) };
  }

  return {
    // العقد الموحّد
    checkAvailability,
    getPricing,
    registerDomain,
    renewDomain,
    transferDomain,
    getDomainDetails,
    updateNameservers,
    getDnsRecords,
    updateDnsRecords,
    deleteDnsRecord,
    getDomainExpiration,
    // إضافات موصى بها
    capabilities,
    checkTransferEligibility,
    getAuthCode,
    setLock,
    setDnssec,
    simulateTransferOutcome,
    // أدوات اختبار
    failNext,
    failAlways,
    setOutage,
    clearFailures,
    seedDomain,
    reset,
    stats,
    get meta() {
      return { provider: "mock", seed, source, environment: "mock", production: false };
    },
  };
}

export { parseDomain, makeRandom };
