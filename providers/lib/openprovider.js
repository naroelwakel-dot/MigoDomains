/* ==========================================================================
   Migo Domains — Openprovider Adapter
   --------------------------------------------------------------------------
   مزوّد التسجيل الرسمي المعتمد للمشروع (قرار المشروع C).

   المصدر الوحيد للحقائق هنا هو توثيق Openprovider الرسمي:
     • https://developer.openprovider.com/get-started.html        (المصادقة + القواعد)
     • https://developer.openprovider.com/data/swagger.json        (الـOpenAPI spec)
   كل مسار وكل حقل في الملف ده جاي من الـspec نفسه، مش من تخمين.

   قواعد إلزامية ماشية على الملف ده:
   1. **صفر تسجيل حقيقي وصفر دفع.** الأدابتر مابيعملش أي عملية مدفوعة من نفسه؛
      اللي يناديه (Backend) هو اللي يقرر، وفي مرحلة التطوير ده بيتنادى على
      Sandbox أو على transport مُحقَن في الاختبارات.
   2. **صفر شبكة افتراضيًا.** الـtransport بيتحقن (`fetch`)، وساعتها الاختبارات
      تشتغل أوفلاين بالكامل. المزوّد نفسه مابيعملش أي اتصال من غير transport.
   3. **التكلفة مش سعر بيع.** `getPricing` بترجّع تكلفة الجملة بس؛ تحويلها لسعر
      بيع مسؤولية محرك التسعير (`pricing/`) عبر `bridge.js`.
   4. **مفيش أسرار في الردود.** المفاتيح بتفضل في الذاكرة، ورمز token ما بيظهرش
      في أي رد.

   ⚠️ حالة التحقق (9 نوفمبر 2026):
     - مسارات المصادقة والتوفر والتسعير والتسجيل والتجديد والنقل والتفاصيل
       والـDNS ورمز النقل مقروءة من الـspec الرسمي: DOCUMENTED.
     - **استخدامها الحقيقي لسه NOT RUN** — مفيش حساب Sandbox ولا مفاتيح،
       ومفيش أي نداء حقيقي. الاختبارات كلها transport وهمي.
     - **عنوان API للـSandbox لسه NOT VERIFIED** — التوثيق بيقول «وجّه
       التكامل على مضيف الـSandbox» من غير ما يذكر المضيف صراحةً في الصفحة
       المقروءة. لازم يتأكد من حساب الـSandbox قبل التشغيل، وممنوع تخمينه.
   ========================================================================== */

import {
  ProviderError,
  PROVIDER_ERROR_CODES,
  TransferEligibilityError,
} from "./errors.js";
import {
  AVAILABILITY_STATES,
  DOMAIN_STATUSES,
  REGISTRY_LOCKS,
  TRANSFER_RULES,
  TRANSFER_REASON_CODES,
} from "./states.js";

/** عناوين الـAPI — من get-started.html بالحرف. */
export const OPENPROVIDER_HOSTS = Object.freeze({
  /** الإنتاج — مؤكَّد من التوثيق. */
  production: "https://api.openprovider.eu/v1",
  /** الـSandbox — **NOT VERIFIED**: لازم يتأكد من حساب الـSandbox. ممنوع التخمين. */
  sandbox: null,
});

/** ترجمة عملية المنصة لاسم العملية في Openprovider. */
export const OPENPROVIDER_OPERATION = Object.freeze({
  registration: "create",
  renewal: "renew",
  transfer: "transfer",
  restore: "restore",
});

/** حالة النقل في Openprovider (data.status) — تُقارن كنصوص من الـAPI. */
const OP_REGISTRY_STATUS_KEYS = Object.freeze({
  CLIENT_HOLD: "client_hold",
  CLIENT_TRANSFER_PROHIBITED: "client_transfer_prohibited",
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** يفصل دومين لـ {name, sld, tld}. يقبل نص أو كائن {name, extension/tld}. */
export function parseDomain(input) {
  let name;
  let extension;
  if (typeof input === "string") {
    name = input.trim().toLowerCase();
  } else if (input && typeof input === "object") {
    if (input.name && input.extension) {
      name = String(input.name).trim().toLowerCase() + "." + String(input.extension).trim().toLowerCase();
    } else {
      name = String(input.name || input.domain || "").trim().toLowerCase();
    }
  } else {
    name = "";
  }
  const parts = name.split(".").filter(Boolean);
  if (parts.length < 2) {
    throw new ProviderError("دومين غير صالح: " + String(name), PROVIDER_ERROR_CODES.DOMAIN_INVALID, { name });
  }
  const tld = parts[parts.length - 1];
  const sld = parts.slice(0, -1).join(".");
  return { name, sld, tld };
}

/**
 * يحوّل ناتج فحص Openprovider لحالة المنصة الموحّدة.
 *
 * ملاحظة صدق: قيم `status` الممكنة **مش موثّقة كـenum في الـspec**، فالماب
 * ده محافظ: بنعتبر AVAILABLE_CONFIRMED **بس** لما الـAPI يقول صراحةً `free`
 * ومن غير premium. أي قيمة تانية مبهمة = UNKNOWN، مش «متاح».
 * كده مستحيل نعلن دومين متاح بالغلط.
 */
export function mapAvailabilityResult(result) {
  const status = String(result && result.status ? result.status : "").toLowerCase();
  const isPremium = Boolean(result && result.is_premium);
  if (isPremium) return AVAILABILITY_STATES.PREMIUM;
  if (status === "free") return AVAILABILITY_STATES.AVAILABLE_CONFIRMED;
  if (status === "taken" || status === "registered" || status === "active" || status === "in use") {
    return AVAILABILITY_STATES.REGISTERED;
  }
  if (status === "reserved") return AVAILABILITY_STATES.RESERVED;
  if (status === "restricted") return AVAILABILITY_STATES.RESTRICTED;
  return AVAILABILITY_STATES.UNKNOWN;
}

/** يبني Adapter Openprovider كامل. */
export function createOpenproviderAdapter(options = {}) {
  const {
    fetch: fetchImpl,
    baseUrl,
    credentials = {},
    environment = "sandbox",
    clock = () => new Date(),
    ip = "0.0.0.0",
    tokenSafetyMs = 30_000,
    onLog = () => {},
  } = options;

  if (typeof fetchImpl !== "function") {
    throw new ProviderError(
      "لازم transport (fetch) يُحقَن — المزوّد مابيعملش اتصال من نفسه",
      PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE
    );
  }

  const production = environment === "production";
  const host = baseUrl || OPENPROVIDER_HOSTS[environment] || null;
  if (!host) {
    throw new ProviderError(
      "عنوان الـAPI للبيئة «" + environment + "» مش معروف (NOT VERIFIED). " +
        "مرّر baseUrl صريح بعد تأكيده من حساب الـSandbox.",
      PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE,
      { environment }
    );
  }
  if (!production && isProductionHost(host)) {
    throw new ProviderError(
      "بيئة غير إنتاجية على مضيف إنتاج — ممنوع. العمليات الحقيقية ممنوعة من هنا.",
      PROVIDER_ERROR_CODES.MOCK_ONLY_NO_PRODUCTION
    );
  }

  const base = String(host).replace(/\/+$/, "");
  const source = "openprovider:" + environment;

  /** حالة الـtoken في الذاكرة بس — مش بتتكتب على أي وسيط دائم. */
  let token = null;
  let tokenExpiresAt = 0;

  function isProductionHost(url) {
    return /api\.openprovider\.(eu|com)\b/.test(url) && !/sandbox/.test(url);
  }

  /* ------------------------------ النقل ------------------------------ */
  async function rawCall(method, path, { body, query, auth = true } = {}) {
    const url = base + path + buildQuery(query);
    const headers = { "Content-Type": "application/json" };
    if (auth) headers.Authorization = "Bearer " + (await ensureToken());

    let res;
    try {
      res = await fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      const code =
        err && (err.name === "AbortError" || err.code === "ETIMEDOUT")
          ? PROVIDER_ERROR_CODES.PROVIDER_TIMEOUT
          : PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE;
      throw new ProviderError("تعذّر الوصول لـOpenprovider", code, { cause: String(err && err.message) });
    }

    if (res.status === 429) {
      throw new ProviderError("Openprovider: تجاوز حد الطلبات", PROVIDER_ERROR_CODES.RATE_LIMITED);
    }

    let payload = null;
    try {
      payload = await res.json();
    } catch (_) {
      payload = null;
    }

    // مغلّف Openprovider: { code, data, desc }. code === 0 = نجاح.
    if (payload && typeof payload.code !== "undefined") {
      if (payload.code !== 0) {
        throw new ProviderError(
          "Openprovider: " + (payload.desc || "خطأ غير معروف") + " (code " + payload.code + ")",
          mapProviderErrorCode(payload),
          { code: payload.code, desc: payload.desc }
        );
      }
      return payload.data;
    }

    if (!res.ok) {
      throw new ProviderError("Openprovider HTTP " + res.status, httpCodeToProviderCode(res.status), {
        status: res.status,
      });
    }
    return payload;
  }

  function buildQuery(query) {
    if (!query) return "";
    const parts = [];
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(v)));
    }
    return parts.length ? "?" + parts.join("&") : "";
  }

  function httpCodeToProviderCode(status) {
    if (status === 404) return PROVIDER_ERROR_CODES.DOMAIN_NOT_FOUND;
    if (status === 401 || status === 403) return PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE;
    if (status >= 500) return PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE;
    return "PROVIDER_ERROR";
  }

  /**
   * ماب أخطاء Openprovider لأكواد المنصة.
   * ملاحظة: قيم code في الـAPI كتير؛ بنمسك الحالات المعروفة ونسيب الباقي
   * PROVIDER_ERROR صريح، وبنحتفظ بالكود الأصلي في detail للمراجعة.
   */
  function mapProviderErrorCode(payload) {
    const desc = String((payload && payload.desc) || "").toLowerCase();
    if (/not found/.test(desc)) return PROVIDER_ERROR_CODES.DOMAIN_NOT_FOUND;
    if (/already registered|is not free|not available/.test(desc)) return PROVIDER_ERROR_CODES.DOMAIN_ALREADY_REGISTERED;
    if (/auth.?code/.test(desc)) return PROVIDER_ERROR_CODES.AUTH_CODE_INVALID;
    return "PROVIDER_ERROR";
  }

  /* ------------------------------ المصادقة ------------------------------ */
  async function ensureToken() {
    const now = clock().getTime();
    if (token && now < tokenExpiresAt - tokenSafetyMs) return token;
    await login();
    return token;
  }

  async function login() {
    const data = await rawCall("POST", "/auth/login", {
      auth: false,
      body: { username: credentials.username, password: credentials.password, ip },
    });
    if (!data || !data.token) {
      throw new ProviderError("Openprovider: مافيش token في رد الدخول", PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE);
    }
    token = data.token;
    // التوثيق بيقول «صالح لمدة محدودة». بنعمله cache وبنعيد الدخول عند الانتهاء.
    // عند عدم معرفة المدة بالظبط، بنستخدم نافذة حذرة.
    tokenExpiresAt = clock().getTime() + (credentials.tokenTtlMs || 5 * 60 * 1000);
    onLog({ event: "openprovider.login", environment });
    return token;
  }

  /* ------------------------------ القدرات ------------------------------ */
  function capabilities() {
    // كل القدرات مدعومة من الـAPI الرسمي (مسارات موثّقة في الـspec).
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
      /** Openprovider بياخد `owner_handle` لكل دومين — الملكية باسم العميل الفعلي. */
      perDomainRegistrant: true,
    });
  }

  /* ------------------------------ 1) التوفر ------------------------------ */
  async function checkAvailability(input) {
    const { sld, tld } = parseDomain(input);
    const data = await rawCall("POST", "/domains/check", {
      body: { domains: [{ name: sld, extension: tld }], with_price: true },
    });
    const result = data && Array.isArray(data.results) ? data.results[0] : null;
    if (!result) {
      return {
        name: sld + "." + tld,
        tld,
        state: AVAILABILITY_STATES.UNKNOWN,
        definitive: false,
        reason: "EMPTY_RESULT",
        source,
        checkedAt: clock().toISOString(),
      };
    }
    const state = mapAvailabilityResult(result);
    return {
      name: result.domain || sld + "." + tld,
      tld,
      state,
      definitive: [AVAILABILITY_STATES.AVAILABLE_CONFIRMED, AVAILABILITY_STATES.REGISTERED].includes(state),
      premium: Boolean(result.is_premium),
      reason: result.reason || null,
      detail: { status: result.status },
      source,
      checkedAt: clock().toISOString(),
    };
  }

  /* ------------------------------ 2) التسعير (تكلفة) ------------------------------ */
  async function getPricing(input, { operation = "registration", period = 1 } = {}) {
    const { sld, tld } = parseDomain(input);
    const op = OPENPROVIDER_OPERATION[operation];
    if (!op) {
      throw new ProviderError("عملية غير مسعّرة: " + operation, PROVIDER_ERROR_CODES.TLD_NOT_SUPPORTED, { operation });
    }
    const data = await rawCall("GET", "/domains/prices", {
      query: { "domain.name": sld, "domain.extension": tld, operation: op, period },
    });
    const product = (data && data.price && data.price.product) || (data && data.data && data.data.price && data.data.price.product);
    if (!product || typeof product.price !== "number") {
      throw new ProviderError("Openprovider: مافيش سعر للعملية " + operation, PROVIDER_ERROR_CODES.TLD_NOT_SUPPORTED, {
        operation,
      });
    }
    return {
      name: sld + "." + tld,
      tld,
      operation,
      currency: product.currency || "USD",
      /** تكلفة الجملة من المزوّد — **مش** سعر بيع. */
      wholesaleUsd: product.price,
      /** Openprovider مابيرجّعش رسوم منفصلة من /domains/prices — صفر، وموثّق كحد. */
      feesUsd: 0,
      source,
      retrievedAt: clock().toISOString(),
    };
  }

  /* ------------------------------ 3) التسجيل ------------------------------ */
  async function registerDomain(input = {}) {
    const { sld, tld } = parseDomain(input.name);
    const years = input.years === undefined ? 1 : Number(input.years);
    if (!Number.isInteger(years) || years < 1 || years > 10) {
      throw new ProviderError("عدد سنوات التسجيل لازم من 1 لـ10", PROVIDER_ERROR_CODES.DOMAIN_INVALID, { years });
    }
    const ownerHandle = resolveHandle(input.registrant);
    const body = {
      domain: { name: sld, extension: tld },
      period: years,
      unit: "y",
      owner_handle: ownerHandle,
      admin_handle: resolveHandle(input.admin) || ownerHandle,
      tech_handle: resolveHandle(input.tech) || ownerHandle,
      billing_handle: resolveHandle(input.billing) || ownerHandle,
      autorenew: input.autorenew === false ? "off" : "on",
    };
    if (Array.isArray(input.nameServers) && input.nameServers.length) {
      body.name_servers = input.nameServers.map(toNameServer);
    }
    const data = await rawCall("POST", "/domains", { body });
    return {
      name: sld + "." + tld,
      providerId: data && data.id !== undefined ? data.id : null,
      status: (data && data.status) || "PENDING",
      expiresAt: (data && data.expiration_date) || null,
      authCodeIncluded: false,
      source,
    };
  }

  /* ------------------------------ 4) التجديد ------------------------------ */
  async function renewDomain(input = {}) {
    const id = requireId(input);
    const years = input.years === undefined ? 1 : Number(input.years);
    const data = await rawCall("POST", "/domains/" + id + "/renew", {
      body: { domain: { name: input.name ? parseDomain(input.name).sld : undefined, extension: input.name ? parseDomain(input.name).tld : undefined }, id, period: years },
    });
    return { providerId: id, renewed: true, expiresAt: (data && data.expiration_date) || null, source };
  }

  /* ------------------------------ 5) النقل ------------------------------ */
  async function transferDomain(input = {}) {
    const { sld, tld } = parseDomain(input.name);
    if (!input.authCode) {
      throw new ProviderError("النقل محتاج رمز نقل (auth code)", PROVIDER_ERROR_CODES.AUTH_CODE_REQUIRED);
    }
    const ownerHandle = resolveHandle(input.registrant);
    const body = {
      domain: { name: sld, extension: tld },
      auth_code: input.authCode,
      owner_handle: ownerHandle,
      autorenew: input.autorenew === false ? "off" : "on",
    };
    const data = await rawCall("POST", "/domains/transfer", { body });
    return {
      name: sld + "." + tld,
      transferId: data && data.id !== undefined ? data.id : null,
      status: (data && data.status) || "PENDING",
      source,
    };
  }

  /* ------------------------------ 6) التفاصيل (بدون رمز النقل) ------------------------------ */
  async function getDomainDetails(input) {
    const data = await fetchDomain(input);
    return toDomainDetails(data);
  }

  function toDomainDetails(data) {
    const d = data || {};
    const domain = d.domain || {};
    return {
      name: domain.name ? domain.name + "." + domain.extension : null,
      tld: domain.extension || null,
      status: mapDomainStatus(d),
      providerId: d.id !== undefined ? d.id : null,
      registeredAt: d.creation_date || null,
      expiresAt: d.expiration_date || null,
      nameservers: Array.isArray(d.name_servers) ? d.name_servers.map((n) => n.name).filter(Boolean) : [],
      locks: locksOf(d),
      dnssec: Boolean(d.is_dnssec_enabled),
      canRenew: Boolean(d.can_renew),
      isLockable: Boolean(d.is_lockable),
      /** تنبيه أمني: رمز النقل ما بيظهرش هنا — له دالة خاصة. */
      authCodeIncluded: false,
      source,
    };
  }

  async function fetchDomain(input) {
    const id = input && input.providerId !== undefined ? input.providerId : null;
    if (id !== null) {
      return rawCall("GET", "/domains/" + id, {
        query: { with_registry_statuses: true },
      });
    }
    const { sld, tld } = parseDomain(input);
    return rawCall("GET", "/domains/" + encodeURIComponent(sld + "." + tld), {
      query: { "domain.name": sld, "domain.extension": tld, with_registry_statuses: true },
    });
  }

  function locksOf(d) {
    const locks = [];
    if (d.is_locked) locks.push(REGISTRY_LOCKS.TRANSFER_PROHIBITED);
    const rs = d.registry_statuses || {};
    if (rs.client_hold) locks.push(REGISTRY_LOCKS.HOLD);
    if (rs.client_transfer_prohibited && !locks.includes(REGISTRY_LOCKS.TRANSFER_PROHIBITED)) {
      locks.push(REGISTRY_LOCKS.TRANSFER_PROHIBITED);
    }
    return locks;
  }

  function mapDomainStatus(d) {
    const statuses = d.registry_statuses || {};
    if (statuses[OP_REGISTRY_STATUS_KEYS.CLIENT_HOLD] || d.is_client_hold_enabled === "on") {
      return DOMAIN_STATUSES.REGISTERED;
    }
    if (d.delete_status === "pending") return DOMAIN_STATUSES.PENDING_DELETE;
    if (d.status === "active" || d.active_date) return DOMAIN_STATUSES.ACTIVE;
    if (d.status === "pending" || d.status === "PENDING") return DOMAIN_STATUSES.REGISTERED;
    return DOMAIN_STATUSES.REGISTERED;
  }

  /* ------------------------------ رمز النقل (سرّي) ------------------------------ */
  async function getAuthCode(input) {
    const id = requireId(input);
    const data = await rawCall("GET", "/domains/" + id + "/authcode");
    const code = data && (data.auth_code || data.internal_auth_code);
    if (!code) {
      throw new ProviderError("Openprovider: مافيش رمز نقل في الرد", PROVIDER_ERROR_CODES.AUTH_CODE_INVALID);
    }
    return {
      name: input.name || null,
      authCode: code,
      sensitive: true,
      warning: "سرّي: ممنوع يظهر في رابط عام أو سجل غير محمي، وممنوع للعميل غير المالك",
      source,
    };
  }

  /* ------------------------------ 7 الأقفال ------------------------------ */
  async function setLock(input, locked = true) {
    const id = requireId(input);
    await rawCall("PUT", "/domains/" + id, { body: { id, is_locked: Boolean(locked) } });
    return { name: input.name || null, locked: Boolean(locked), source };
  }

  /* ------------------------------ 8 الأسماء (Nameservers) ------------------------------ */
  async function updateNameservers(input = {}) {
    const id = requireId(input);
    if (!Array.isArray(input.nameServers) || input.nameServers.length < 2 || input.nameServers.length > 6) {
      throw new ProviderError("الـNameservers لازم من 2 لـ6", PROVIDER_ERROR_CODES.NAMESERVER_INVALID);
    }
    await rawCall("PUT", "/domains/" + id, {
      body: { id, name_servers: input.nameServers.map(toNameServer) },
    });
    return { name: input.name || null, nameservers: input.nameServers.slice(), source };
  }

  /* ------------------------------ 9 سجلات DNS ------------------------------ */
  async function getDnsRecords(input) {
    const zone = zoneName(input);
    const data = await rawCall("GET", "/dns/zones/" + zone + "/records");
    const results = (data && data.results) || [];
    return results.map(toDnsRecord);
  }

  async function updateDnsRecords(input = {}) {
    const zone = zoneName(input);
    const add = Array.isArray(input.add) ? input.add.map(cleanRecord) : [];
    const remove = Array.isArray(input.remove) ? input.remove.map(cleanRecord) : [];
    const replace = Array.isArray(input.replace) ? input.replace.map(cleanRecord) : [];
    const update = Array.isArray(input.update) ? input.update : [];
    await rawCall("PUT", "/dns/zones/" + zone, {
      body: { name: zone, type: "master", records: { add, remove, replace, update } },
    });
    return { zone, changed: add.length + remove.length + replace.length + update.length, source };
  }

  async function deleteDnsRecord(input = {}) {
    const zone = zoneName(input);
    const record = cleanRecord(input.record || input);
    await rawCall("PUT", "/dns/zones/" + zone, {
      body: { name: zone, type: "master", records: { remove: [record] } },
    });
    return { zone, removed: record, source };
  }

  /* ------------------------------ 10 انتهاء الصلاحية ------------------------------ */
  async function getDomainExpiration(input) {
    const data = await fetchDomain(input);
    return { name: (data && data.domain && data.domain.name + "." + data.domain.extension) || null, expiresAt: (data && data.expiration_date) || null, source };
  }

  /* ------------------------------ 11 أهلية النقل (محسوبة) ------------------------------ */
  async function checkTransferEligibility(input, { asOf, throwOnIneligible = false } = {}) {
    const data = await fetchDomain(input);
    const details = toDomainDetails(data);
    const at = asOf ? new Date(asOf) : clock();
    const reasons = [];

    if (details.locks.includes(REGISTRY_LOCKS.TRANSFER_PROHIBITED)) {
      reasons.push({ code: TRANSFER_REASON_CODES.TRANSFER_LOCKED, message: "قفل النقل مفعّل (clientTransferProhibited)" });
    }
    if (!details.isLockable && details.locks.length === 0) {
      // بعض TLDs مابتسمحش بالقفل أصلاً — مش مانع نقل بذاته، فمش بنضيف سبب.
    }
    if (details.dnssec) {
      reasons.push({ code: TRANSFER_REASON_CODES.DNSSEC_ACTIVE, message: "DNSSEC مفعّل — لازم يتقفل قبل النقل" });
    }
    if ([DOMAIN_STATUSES.PENDING_DELETE, DOMAIN_STATUSES.REDEMPTION_PERIOD].includes(details.status)) {
      reasons.push({ code: TRANSFER_REASON_CODES.BAD_STATUS, message: "الدومين في " + details.status });
    }
    const anchor = data.transfer_date || data.creation_date || data.active_date;
    if (anchor) {
      const days = (at.getTime() - new Date(anchor).getTime()) / DAY_MS;
      if (days < TRANSFER_RULES.LOCK_WINDOW_DAYS) {
        reasons.push({ code: TRANSFER_REASON_CODES.WITHIN_60_DAYS, message: "لسه ما مرّوش 60 يوم من التسجيل أو آخر نقل" });
      }
    }

    const result = {
      name: details.name,
      status: details.status,
      eligible: reasons.length === 0,
      reasons,
      checkedAt: at.toISOString(),
      note: "الأهلية محسوبة من الحالة والقواعد، ومش حالة أساسية",
      source,
    };
    if (throwOnIneligible && reasons.length > 0) throw new TransferEligibilityError(reasons);
    return result;
  }

  /* ------------------------------ أدوات داخلية ------------------------------ */
  function resolveHandle(contact) {
    if (!contact) return undefined;
    if (typeof contact === "string") return contact;
    if (contact.handle) return String(contact.handle);
    throw new ProviderError(
      "Openprovider بيحتاج handle للاتصال، مش بيانات مباشرة — أنشئ العميل/الاتصال الأول",
      PROVIDER_ERROR_CODES.REGISTRANT_REQUIRED,
      { contact: contact.email || null }
    );
  }

  function requireId(input) {
    const id = input && input.providerId !== undefined ? input.providerId : input && input.id;
    if (id === undefined || id === null) {
      throw new ProviderError("العملية محتاجة providerId (رقم الدومين عند Openprovider)", PROVIDER_ERROR_CODES.DOMAIN_INVALID);
    }
    return id;
  }

  function toNameServer(ns) {
    if (typeof ns === "string") return { name: ns };
    return { name: ns.name, ip: ns.ip, ip6: ns.ip6, seq_nr: ns.seqNr };
  }

  function toDnsRecord(r) {
    return { name: r.name, type: r.type, value: r.value, ttl: r.ttl, prio: r.prio, source };
  }

  function cleanRecord(r) {
    return { name: r.name, type: r.type, value: r.value, ttl: r.ttl, prio: r.prio };
  }

  function zoneName(input) {
    if (typeof input === "string") return input;
    if (input && input.zone) return String(input.zone);
    if (input && input.name) return parseDomain(input).name;
    throw new ProviderError("اسم الـzone مطلوب", PROVIDER_ERROR_CODES.DOMAIN_INVALID);
  }

  const adapter = {
    meta: {
      provider: "openprovider",
      environment,
      production,
      source,
    },
    capabilities,
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
    checkTransferEligibility,
    getAuthCode,
    setLock,
    /* أدوات للتشغيل والاختبار */
    login,
    _rawCall: rawCall,
  };

  return adapter;
}
