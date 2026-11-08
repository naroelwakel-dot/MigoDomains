/* ==========================================================================
   Migo Domains — شرائح الهامش المعتمدة
   --------------------------------------------------------------------------
   المصدر: docs/PRICING_POLICY.md وdocs/phase-zero/PRICING_ENGINE_REVIEW.md
   السياسة إلزامية ولا يجوز تعديلها إلا بقرار موثّق من صاحب المشروع.

   | التكلفة (USD)        | الهامش                |
   | أقل من 8             | ثابت 2.50             |
   | من 8 إلى أقل من 15   | ثابت 3.00             |
   | من 15 إلى 30 (شاملًا)| ثابت 4.00             |
   | أكثر من 30           | 15% بحد أدنى 4.00     |

   الحدود مملوكة بوضوح: 8 تدخل الشريحة الثانية، و30 تدخل الثالثة،
   و30.01 تدخل الرابعة. لا فجوات ولا تداخلات.
   ========================================================================== */

import { toMicros, toDecimalString } from "./decimal.js";

/** إصدار القاعدة — يتحفظ مع كل عرض سعر عشان نقدر نرجع تاريخيًا. */
export const TIER_RULE_VERSION = "1.0";

/**
 * الشرائح العامة. كل شريحة ليها حدود صريحة (lower/upper) عشان نقدر
 * نتحقق آليًا إن مفيش فجوات ولا تداخلات — مش بس نعتمد على الترتيب.
 */
export const DEFAULT_TIERS = Object.freeze([
  Object.freeze({
    id: "tier_under_8",
    label: "أقل من 8",
    lower: null,
    upper: "8",
    upperInclusive: false,
    mode: "flat",
    value: "2.50",
  }),
  Object.freeze({
    id: "tier_8_to_15",
    label: "من 8 إلى أقل من 15",
    lower: "8",
    lowerInclusive: true,
    upper: "15",
    upperInclusive: false,
    mode: "flat",
    value: "3.00",
  }),
  Object.freeze({
    id: "tier_15_to_30",
    label: "من 15 إلى 30",
    lower: "15",
    lowerInclusive: true,
    upper: "30",
    upperInclusive: true,
    mode: "flat",
    value: "4.00",
  }),
  Object.freeze({
    id: "tier_over_30",
    label: "أكثر من 30",
    lower: "30",
    lowerInclusive: false,
    upper: null,
    mode: "percent",
    value: "15",
    floor: "4.00",
  }),
]);

/** خطأ في قواعد الهامش. */
export class MarginError extends Error {
  constructor(message, code = "MARGIN_ERROR", detail) {
    super(message);
    this.name = "MarginError";
    this.code = code;
    if (detail !== undefined) this.detail = detail;
  }
}

/** هل التكلفة داخل حدود الشريحة؟ */
export function inTier(micros, tier) {
  if (tier.lower !== null && tier.lower !== undefined) {
    const lo = toMicros(tier.lower);
    const okLower = tier.lowerInclusive === false ? micros > lo : micros >= lo;
    if (!okLower) return false;
  }
  if (tier.upper !== null && tier.upper !== undefined) {
    const hi = toMicros(tier.upper);
    const okUpper = tier.upperInclusive === true ? micros <= hi : micros < hi;
    if (!okUpper) return false;
  }
  return true;
}

/** كل الشرائح المطابقة لتكلفة معيّنة (المفروض دايمًا واحدة). */
export function matchingTiers(micros, tiers = DEFAULT_TIERS) {
  return tiers.filter((t) => inTier(micros, t));
}

/** الشريحة الوحيدة المطابقة — وبترمي لو مفيش أو في أكتر من واحدة. */
export function pickTier(micros, tiers = DEFAULT_TIERS) {
  const hits = matchingTiers(micros, tiers);
  if (hits.length === 1) return hits[0];
  const shown = toDecimalString(micros);
  if (hits.length === 0) {
    throw new MarginError(
      "مفيش شريحة هامش تغطّي التكلفة " + shown,
      "TIER_GAP",
      { cost: shown }
    );
  }
  throw new MarginError(
    "أكتر من شريحة هامش بتغطّي التكلفة " + shown + ": " + hits.map((t) => t.id).join(", "),
    "TIER_OVERLAP",
    { cost: shown, tiers: hits.map((t) => t.id) }
  );
}

/**
 * تدقيق الشرائح على مدى من التكلفة: بيدوّر على فجوات وتداخلات.
 * بيرجّع { ok, gaps: [], overlaps: [] } — للتشغيل في الاختبارات والـ CI.
 */
export function analyzeTiers(tiers = DEFAULT_TIERS, { from = "0", to = "200", step = "0.01" } = {}) {
  const gaps = [];
  const overlaps = [];
  const stepMicros = toMicros(step);
  if (stepMicros <= 0n) {
    throw new MarginError("خطوة التدقيق لازم تكون أكبر من صفر", "TIER_BAD_STEP");
  }
  for (let v = toMicros(from); v <= toMicros(to); v += stepMicros) {
    const hits = matchingTiers(v, tiers);
    if (hits.length === 0) gaps.push(toDecimalString(v));
    else if (hits.length > 1) {
      overlaps.push({ cost: toDecimalString(v), tiers: hits.map((t) => t.id) });
    }
  }
  return { ok: gaps.length === 0 && overlaps.length === 0, gaps, overlaps };
}
