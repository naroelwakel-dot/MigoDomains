/* ==========================================================================
   Migo Domains — استعلام RDAP
   --------------------------------------------------------------------------
   قواعد مأخوذة بالحرف من مواصفات محرك التوفر:
     • عدم ظهور سجل **لا يعني تلقائيًا** إن الدومين متاح.
     • عدم استجابة المصدر = UNKNOWN (مش متاح).
     • منع الاستنتاج الخاطئ من 404.
     • تسجيل مصدر ووقت الفحص.

   النقطة الدقيقة: RDAP 404 من السيرفر المختص بالامتداد هو **الدليل الحاسم**
   الوحيد على عدم وجود سجل. ومع ذلك، القرار النهائي للتسجيل **مش** من هنا —
   هو من Registrar Availability API (شوف engine.combine).
   ========================================================================== */

import { AVAILABILITY_STATES as S } from "../../providers/lib/states.js";
import { buildRdapUrl } from "./bootstrap.js";

export const RDAP_REASONS = Object.freeze({
  OK: "OK",
  NOT_FOUND: "NOT_FOUND",
  NO_SERVER_FOR_TLD: "RDAP_NOT_AVAILABLE_FOR_TLD",
  RATE_LIMITED: "RATE_LIMITED",
  TIMEOUT: "SOURCE_TIMEOUT",
  NETWORK_ERROR: "SOURCE_NOT_RESPONDING",
  SERVER_ERROR: "SOURCE_ERROR",
  BAD_RESPONSE: "SOURCE_BAD_RESPONSE",
  BLOCKED: "SOURCE_BLOCKED",
});

function make(state, reason, { definitive, checkedAt, source = "rdap", serverUrl = null, httpStatus = null, detail = null, url = null } = {}) {
  return Object.freeze({
    state,
    definitive: Boolean(definitive),
    reason,
    source,
    serverUrl,
    url,
    httpStatus,
    checkedAt,
    detail,
  });
}

async function fetchWithTimeout(fetchImpl, url, { timeoutMs, headers }) {
  if (typeof fetchImpl !== "function") throw new Error("لازم تمرير fetch للاستعلام");
  if (typeof AbortController === "undefined") {
    return fetchImpl(url, { headers, redirect: "manual" });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { headers, redirect: "manual", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * استعلام RDAP لدومين واحد.
 * @returns {Promise<{state, definitive, reason, source, checkedAt, httpStatus, serverUrl, url, detail}>}
 */
export async function rdapLookup(domain, { fetch: fetchImpl, serverUrl, timeoutMs = 8000, now = () => new Date(), headers } = {}) {
  const checkedAt = now().toISOString();
  const name = String(domain || "").toLowerCase();

  if (!serverUrl) {
    return make(S.UNKNOWN, RDAP_REASONS.NO_SERVER_FOR_TLD, { definitive: false, checkedAt });
  }

  const url = buildRdapUrl(serverUrl, name);
  let res;
  try {
    res = await fetchWithTimeout(fetchImpl, url, {
      timeoutMs,
      headers: headers || { accept: "application/rdap+json, application/json" },
    });
  } catch (err) {
    const aborted = err && (err.name === "AbortError" || err.code === "ABORT_ERR");
    return make(S.UNKNOWN, aborted ? RDAP_REASONS.TIMEOUT : RDAP_REASONS.NETWORK_ERROR, {
      definitive: false,
      checkedAt,
      serverUrl,
      url,
    });
  }

  const status = res && typeof res.status === "number" ? res.status : 0;

  if (status >= 300 && status < 400) {
    // إعادة توجيه: نبلّغ بيها ولا نكملها تلقائيًا عشان ما نخبّيش المصدر الحقيقي.
    const location = res.headers && typeof res.headers.get === "function" ? res.headers.get("location") : null;
    return make(S.MANUAL_REVIEW, "HTTP_REDIRECT", {
      definitive: false,
      checkedAt,
      serverUrl,
      url,
      httpStatus: status,
      detail: { location },
    });
  }

  if (status === 200) {
    let body = null;
    try {
      body = typeof res.json === "function" ? await res.json() : null;
    } catch {
      body = null;
    }
    if (!body || typeof body !== "object") {
      return make(S.UNKNOWN, RDAP_REASONS.BAD_RESPONSE, { definitive: false, checkedAt, serverUrl, url, httpStatus: status });
    }
    const statuses = Array.isArray(body.status) ? body.status.map(String) : [];
    if (statuses.some((s) => /reserved|blocked/i.test(s))) {
      return make(S.RESERVED, "RESERVED", {
        definitive: true,
        checkedAt,
        serverUrl,
        url,
        httpStatus: status,
        detail: { handle: body.handle || null, ldhName: body.ldhName || null, statuses },
      });
    }
    if (statuses.some((s) => /client hold|server hold/i.test(s))) {
      return make(S.RESTRICTED, "REGISTRY_HOLD", {
        definitive: true,
        checkedAt,
        serverUrl,
        url,
        httpStatus: status,
        detail: { handle: body.handle || null, ldhName: body.ldhName || null, statuses },
      });
    }
    return make(S.REGISTERED, RDAP_REASONS.OK, {
      definitive: true,
      checkedAt,
      serverUrl,
      url,
      httpStatus: status,
      detail: { handle: body.handle || null, ldhName: body.ldhName || null, statuses },
    });
  }

  if (status === 404) {
    // دليل حاسم من المصدر المختص: مفيش سجل. لازم تأكيد الـRegistrar قبل التسجيل.
    return make(S.AVAILABLE_CONFIRMED, RDAP_REASONS.NOT_FOUND, { definitive: true, checkedAt, serverUrl, url, httpStatus: status });
  }
  if (status === 429) {
    return make(S.PROVIDER_ERROR, RDAP_REASONS.RATE_LIMITED, { definitive: false, checkedAt, serverUrl, url, httpStatus: status });
  }
  if (status === 403 || status === 451) {
    return make(S.MANUAL_REVIEW, RDAP_REASONS.BLOCKED, { definitive: false, checkedAt, serverUrl, url, httpStatus: status });
  }
  if (status >= 500) {
    return make(S.PROVIDER_ERROR, RDAP_REASONS.SERVER_ERROR, { definitive: false, checkedAt, serverUrl, url, httpStatus: status });
  }
  return make(S.MANUAL_REVIEW, "HTTP_" + status, { definitive: false, checkedAt, serverUrl, url, httpStatus: status });
}
