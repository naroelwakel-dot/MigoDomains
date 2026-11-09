/* ==========================================================================
   Migo Domains — محرك التحقق من التوفر
   --------------------------------------------------------------------------
   يجمع: IANA Bootstrap → سيرفر RDAP المختص → استعلام → Cache → Rate Limit.

   قاعدة الفصل (مواصفات المشروع): البحث ≠ التحقق ≠ عرض السعر ≠ التسجيل.
   والقاعدة الأهم: **Registrar Availability API هو المرجع النهائي قبل التسجيل**،
   فـ`combine` بتخلي كلمة الـRegistrar تتقدّم، والاختلاف بين المصدرين
   بيروّح لحالة MANUAL_REVIEW مش لتخمين.
   ========================================================================== */

import { AVAILABILITY_STATES as S, AVAILABILITY_IS_DEFINITIVE } from "../../providers/lib/states.js";
import { serverForTld, tldOf } from "./bootstrap.js";
import { createTtlCache } from "./cache.js";
import { createTokenBucket } from "./ratelimit.js";
import { rdapLookup } from "./rdap.js";

export function normalizeDomain(input) {
  return String(input || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export function isDefinitive(state) {
  return AVAILABILITY_IS_DEFINITIVE.includes(state);
}

export function createAvailabilityEngine({
  fetch: fetchImpl,
  servers,
  now = () => new Date(),
  clockMs = () => Date.now(),
  cache = createTtlCache({ now: clockMs }),
  limiter = createTokenBucket({ capacity: 30, refillPerSecond: 0.5, now: clockMs }),
  timeoutMs = 8000,
  cacheTtl = { definitiveTtlMs: 5 * 60 * 1000, unknownTtlMs: 30 * 1000 },
} = {}) {
  async function check(domain, { force = false } = {}) {
    const name = normalizeDomain(domain);
    const tld = tldOf(name);

    if (!name || name.split(".").length < 2) {
      return Object.freeze({ name, tld, state: S.UNKNOWN, reason: "DOMAIN_INVALID", definitive: false, source: "input", checkedAt: now().toISOString(), cached: false });
    }

    const key = "avail:" + name;
    if (!force) {
      const hit = cache.get(key);
      if (hit) return Object.freeze({ ...hit, cached: true });
    }

    if (limiter && !limiter.tryTake(1)) {
      return Object.freeze({
        name,
        tld,
        state: S.PROVIDER_ERROR,
        reason: "RATE_LIMITED",
        definitive: false,
        source: "rate-limiter",
        checkedAt: now().toISOString(),
        cached: false,
        retryAfterMs: Math.ceil(1000 / 0.5),
      });
    }

    const serverUrl = serverForTld(servers, tld);
    const rdap = await rdapLookup(name, { fetch: fetchImpl, serverUrl, timeoutMs, now });

    const result = Object.freeze({
      name,
      tld,
      ...rdap,
      cached: false,
      // القرار الحاسم على «متاح» بيتطلب تأكيد الـRegistrar قبل أي تسجيل.
      requiresRegistrarConfirmation: rdap.state === S.AVAILABLE_CONFIRMED,
      isDefinitive: isDefinitive(rdap.state),
    });

    const ttl = isDefinitive(rdap.state) ? cacheTtl.definitiveTtlMs : cacheTtl.unknownTtlMs;
    cache.set(key, result, ttl);
    return result;
  }

  /**
   * دمج نتيجة RDAP مع نتيجة الـRegistrar (المرجع النهائي).
   * @param {object} rdap      ناتج check()
   * @param {object} registrar ناتج provider.checkAvailability() — {state, definitive}
   */
  function combine(rdap, registrar) {
    if (!registrar) return Object.freeze({ ...rdap, sources: [{ source: rdap.source, state: rdap.state }] });
    const regState = registrar.state;
    const regDefinitive = registrar.definitive !== false && isDefinitive(regState);
    const conflict = regDefinitive && rdap.definitive && regState !== rdap.state;

    if (conflict) {
      return Object.freeze({
        ...rdap,
        state: S.MANUAL_REVIEW,
        definitive: false,
        reason: "SOURCE_CONFLICT",
        conflict: { rdap: rdap.state, registrar: regState },
        sources: [
          { source: rdap.source, state: rdap.state },
          { source: "registrar", state: regState },
        ],
      });
    }

    if (regDefinitive) {
      return Object.freeze({
        ...rdap,
        state: regState,
        definitive: true,
        reason: "REGISTRAR_AUTHORITATIVE",
        authoritativeSource: "registrar",
        sources: [
          { source: rdap.source, state: rdap.state },
          { source: "registrar", state: regState },
        ],
      });
    }

    return Object.freeze({ ...rdap, sources: [{ source: rdap.source, state: rdap.state }] });
  }

  function invalidate(domain) {
    cache.delete("avail:" + normalizeDomain(domain));
  }

  return {
    check,
    combine,
    invalidate,
    isDefinitive,
    normalizeDomain,
    cache,
    limiter,
    get stats() {
      return { cached: cache.size, tokens: limiter ? limiter.available : null };
    },
  };
}
