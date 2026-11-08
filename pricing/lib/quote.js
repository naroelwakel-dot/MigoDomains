/* ==========================================================================
   Migo Domains — إصدار وإعادة التحقق من عروض السعر
   --------------------------------------------------------------------------
   متطلبات المحرك:
     • تثبيت سعر الـ Quote لمدة محددة (افتراضيًا 15 دقيقة).
     • إعادة التحقق قبل التسجيل.
     • **ممنوع** إصدار سعر حقيقي عند غياب تكلفة موثوقة.
     • عدم إظهار تكلفة المورّد أو هامش Migo للعميل.
     • دعم USD و EGP.

   تصميم مقصود: عرض السعر كائن **مجمَّد** فيه نسخة من التكلفة وسعر الصرف
   اللحظية. لو المورّد غيّر سعره بعد كده، العرض القديم ما يتغيّرش — بيتعمل
   عرض جديد. ده اللي بيحمي العميل والشركة في نفس الوقت.
   ========================================================================== */

import { toMicros, toDecimalString, toFixedString, roundTo, DecimalError } from "./decimal.js";
import { priceFromCost, assertClientSafe, MarginError } from "./margin.js";
import { convertToEgp } from "./fx.js";
import { checkCostFreshness, snapshotToRecord } from "./cost-feed.js";
import { DEFAULT_CONFIG, OPERATIONS } from "./config.js";

export class QuoteError extends Error {
  constructor(message, code = "QUOTE_ERROR", detail) {
    super(message);
    this.name = "QuoteError";
    this.code = code;
    if (detail !== undefined) this.detail = detail;
  }
}

function newQuoteId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return "q-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

/**
 * يصدر عرض سعر.
 *
 * @param {object} input
 * @param {string} input.operation — registration | renewal | transfer
 * @param {object} input.snapshot  — لقطة تكلفة المورّد (makeCostSnapshot).
 * @param {string} [input.domain]
 * @param {string} [input.tld]
 * @param {object} [input.fx]      — { rate, source, fetchedAt, trusted }
 * @param {object} [input.config]  — إعدادات (افتراضيًا DEFAULT_CONFIG).
 * @param {Date}   [input.now]
 * @param {string} [input.id]      — للتثبيت في الاختبارات.
 * @returns {object} عرض سعر مجمَّد.
 * @throws {QuoteError} لو التكلفة غايبة/قديمة/غير موثوقة.
 */
export function issueQuote(input = {}) {
  const {
    operation,
    snapshot,
    domain = null,
    tld = null,
    fx = null,
    config = DEFAULT_CONFIG,
    now = new Date(),
    id,
  } = input;

  if (!OPERATIONS.includes(operation)) {
    throw new QuoteError(
      "عملية غير مدعومة: " + String(operation) + " (المتاح: " + OPERATIONS.join(", ") + ")",
      "OPERATION_UNSUPPORTED"
    );
  }

  // 1) التكلفة لازم تكون موجودة وطازجة وموثوقة — وإلا مفيش سعر حقيقي.
  const freshness = checkCostFreshness(snapshot, { now, maxAgeMs: config.cost.maxAgeMs });
  if (!freshness.ok) {
    throw new QuoteError(
      "ممنوع إصدار سعر بدون تكلفة موثوقة. " + freshness.message,
      freshness.reason,
      { reason: freshness.reason }
    );
  }

  // 2) الهامش على التكلفة الكلية (بأولوية تجاوز الامتداد).
  const override = tld && config.tldOverrides ? config.tldOverrides[String(tld).toLowerCase()] || null : null;

  let priced;
  try {
    priced = priceFromCost(snapshot.totalMicros, {
      tiers: config.tiers,
      override,
      zeroCost: config.zeroCost,
    });
  } catch (err) {
    if (err instanceof MarginError) {
      throw new QuoteError("تعذّر حساب الهامش: " + err.message, err.code, err.detail);
    }
    throw err;
  }

  // 3) التقريب النهائي للعرض — من الإعدادات، مش مثبّت في الكود.
  const r = config.rounding;
  const usd = (micros) => toFixedString(micros, r.usdDecimals, r.mode);
  const egpFmt = (micros) => toFixedString(micros, r.egpDecimals, r.mode);

  // 4) EGP: يتوقف لو السعر قديم أو غير موثوق — ومايخترعش سعر.
  let egp = { available: false, reason: null, message: null };
  if (config.quote.includeEgp) {
    const converted = convertToEgp(priced.saleMicros, fx, {
      now,
      maxAgeMs: config.fx.maxAgeMs,
      bufferPercent: config.fx.bufferPercent,
    });
    if (converted.ok) {
      egp = {
        available: true,
        reason: null,
        message: null,
        saleMicros: roundTo(converted.egpMicros, r.egpDecimals, r.mode),
        exactMicros: converted.egpMicros,
        rate: converted.rate,
        source: converted.source,
        fetchedAt: converted.fetchedAt,
        ageMs: converted.ageMs,
        bufferPercent: converted.bufferPercent,
      };
    } else {
      egp = { available: false, reason: converted.reason, message: converted.message };
    }
  } else {
    egp = { available: false, reason: "FX_DISABLED", message: "عروض EGP موقوفة بإعدادات." };
  }

  const issuedAt = now instanceof Date ? now : new Date(now);
  const quote = {
    quoteId: id || newQuoteId(),
    status: "issued",
    issuedAt: issuedAt.toISOString(),
    lockedUntil: new Date(issuedAt.getTime() + config.quote.lockMs).toISOString(),
    operation,
    domain,
    tld: tld ? String(tld).toLowerCase() : null,

    // --- داخلي: ممنوع يظهر للعميل ---
    cost: {
      wholesaleUsd: usd(snapshot.wholesaleMicros),
      feesUsd: usd(snapshot.feesMicros),
      totalUsd: usd(snapshot.totalMicros),
      source: snapshot.source,
      retrievedAt: snapshot.retrievedAt,
      ageMs: freshness.ageMs,
    },
    margin: {
      usd: usd(priced.marginMicros),
      rule: priced.marginRule,
      ruleId: priced.marginRuleId,
      detail: priced.marginDetail,
    },

    // --- آمن للعميل ---
    sale: {
      currency: "USD",
      usd: usd(priced.saleMicros),
      usdExact: toDecimalString(priced.saleMicros),
      decimals: r.usdDecimals,
      roundingMode: r.mode,
    },
    egp: {
      currency: "EGP",
      available: egp.available,
      value: egp.available ? egpFmt(egp.exactMicros) : null,
      decimals: r.egpDecimals,
      unavailableReason: egp.available ? null : egp.reason,
      unavailableMessage: egp.available ? null : egp.message,
    },
    fx: egp.available
      ? { rate: egp.rate, source: egp.source, fetchedAt: egp.fetchedAt, ageMs: egp.ageMs, bufferPercent: egp.bufferPercent }
      : null,
    tierRuleVersion: "1.0",
  };

  return Object.freeze(quote);
}

/** المفاتيح اللي مسموح تظهر للعميل — مرجع للاختبارات والمراجعة. */
export const CLIENT_QUOTE_KEYS = Object.freeze([
  "quoteId",
  "issuedAt",
  "lockedUntil",
  "operation",
  "domain",
  "tld",
  "sale",
  "egp",
  "tierRuleVersion",
]);

/**
 * نسخة العميل من عرض السعر: بتشيل التكلفة والهامش.
 * وبعد الحذف، بتتأكد آليًا إن مفيش أي تسريب.
 */
export function toClientQuote(quote) {
  const out = {};
  for (const key of CLIENT_QUOTE_KEYS) out[key] = quote[key];
  assertClientSafe(out, "clientQuote");
  return Object.freeze(out);
}

/** هل العرض لسه جوه مدة القفل؟ */
export function isQuoteLocked(quote, now = new Date()) {
  const until = new Date(quote.lockedUntil);
  return now.getTime() <= until.getTime();
}

/**
 * إعادة التحقق قبل التسجيل.
 * بتحسب السعر من التكلفة الطازجة وتقارن بالعرض الأصلي.
 *
 * @returns {{
 *   status: "unchanged"|"cost_changed"|"expired"|"cost_unavailable",
 *   requiresRequote: boolean,
 *   ...
 * }}
 */
export function recheckQuote(quote, { snapshot, now = new Date(), config = DEFAULT_CONFIG } = {}) {
  if (!isQuoteLocked(quote, now)) {
    return {
      status: "expired",
      requiresRequote: true,
      reason: "QUOTE_EXPIRED",
      message: "مدة قفل عرض السعر انتهت — لازم عرض جديد قبل التسجيل.",
      lockedUntil: quote.lockedUntil,
    };
  }

  const freshness = checkCostFreshness(snapshot, { now, maxAgeMs: config.cost.maxAgeMs });
  if (!freshness.ok) {
    return {
      status: "cost_unavailable",
      requiresRequote: true,
      reason: freshness.reason,
      message: "تعذّر إعادة التحقق: " + freshness.message,
    };
  }

  const override =
    quote.tld && config.tldOverrides ? config.tldOverrides[quote.tld] || null : null;

  let priced;
  try {
    priced = priceFromCost(snapshot.totalMicros, {
      tiers: config.tiers,
      override,
      zeroCost: config.zeroCost,
    });
  } catch (err) {
    if (err instanceof MarginError) {
      return {
        status: "cost_unavailable",
        requiresRequote: true,
        reason: err.code,
        message: "تعذّر إعادة التحقق: " + err.message,
      };
    }
    throw err;
  }

  const oldSaleUsd = toMicros(quote.sale.usdExact);
  const tolerance = toMicros(config.cost.changeTolerancePercent);
  const deltaExact = priced.saleMicros - oldSaleUsd;

  // المقارنة بتحصل على السعر الحقيقي غير المقرَّب (usdExact) — أدق.
  const changed = deltaExact !== 0n;

  return {
    status: changed ? "cost_changed" : "unchanged",
    requiresRequote: changed,
    reason: changed ? "COST_CHANGED" : null,
    message: changed
      ? "تكلفة المورّد اتغيّرت — لازم عرض سعر جديد قبل التسجيل."
      : "التكلفة زي ما هي — العرض صالح للتسجيل.",
    previousSaleUsdExact: toDecimalString(oldSaleUsd),
    currentSaleUsdExact: toDecimalString(priced.saleMicros),
    deltaUsdExact: toDecimalString(deltaExact),
    cost: snapshotToRecord(snapshot),
    tolerancePercent: String(config.cost.changeTolerancePercent),
    toleranceMicros: toDecimalString(tolerance),
  };
}

/**
 * تسعير Premium Domains — **PENDING (P5)**.
 * مفيش سياسة متّفق عليها، فالسلوك المقصود: رفض صريح، وممنوع اختلاق هامش.
 */
export function pricePremiumDomain(input = {}) {
  const { config = DEFAULT_CONFIG } = input;
  if (!config.premium || config.premium.configured !== true || !config.premium.strategy) {
    throw new QuoteError(
      "تسعير الدومينات المميّزة (Premium) محتاج قرار صاحب المشروع (P5) — مفيش هامش مُختلق.",
      "PREMIUM_PRICING_NOT_CONFIGURED"
    );
  }
  const strategy = config.premium.strategy;
  if (typeof strategy !== "function") {
    throw new QuoteError("استراتيجية تسعير Premium لازم تكون دالة.", "PREMIUM_STRATEGY_INVALID");
  }
  return strategy(input);
}

export { DecimalError };
