/* ==========================================================================
   Migo Domains — حساب الهامش
   --------------------------------------------------------------------------
   القاعدة المعتمدة:
     Total Cost USD = تكلفة المورّد بالجملة + رسوم المورّد
     Margin         = شريحة الهامش (على Total Cost)
     Sale Price USD = Total Cost + Margin
     Sale Price EGP = Sale Price USD × سعر الصرف المعتمد

   الأولوية: TLD Override ثم القاعدة العامة.
   نفس القاعدة على Registration و Renewal و Transfer — كل عملية من تكلفتها.
   ========================================================================== */

import { toMicros, percentOf, maxBig, DecimalError } from "./decimal.js";
import { DEFAULT_TIERS, pickTier, MarginError } from "./tiers.js";

/** أنواع قواعد الهامش المدعومة. */
export const RULE_MODES = Object.freeze(["flat", "percent"]);

/** قيم افتراضية لسلوك التكلفة الصفرية (قرار P3 معلّق). */
export const ZERO_COST_POLICY = Object.freeze({
  /** افتراضيًا نرفض التسعير على تكلفة صفر لحد ما صاحب المشروع يقرّر (P3). */
  allow: false,
});

function validateRule(rule, where) {
  if (!rule || typeof rule !== "object") {
    throw new MarginError("قاعدة هامش غير صحيحة في " + where, "RULE_INVALID");
  }
  if (!RULE_MODES.includes(rule.mode)) {
    throw new MarginError(
      "نوع هامش غير معروف في " + where + ": " + String(rule.mode),
      "RULE_BAD_MODE"
    );
  }
  if (rule.value === undefined || rule.value === null) {
    throw new MarginError("قاعدة هامش بدون قيمة في " + where, "RULE_NO_VALUE");
  }
  if (rule.mode === "percent" && rule.floor !== undefined && rule.floor !== null) {
    toMicros(rule.floor); // التحقق من الصيغة
  }
  return rule;
}

function applyRule(rule, costMicros, kind) {
  const valueMicros = toMicros(rule.value);

  if (rule.mode === "flat") {
    if (valueMicros < 0n) {
      throw new MarginError("هامش ثابت سالب", "RULE_NEGATIVE_MARGIN");
    }
    return {
      amountMicros: valueMicros,
      rule: kind,
      ruleId: rule.id || null,
      label: rule.label || null,
      detail: { mode: "flat", value: rule.value },
    };
  }

  // percent
  let amountMicros = percentOf(costMicros, rule.value);
  let floored = false;
  if (rule.floor !== undefined && rule.floor !== null) {
    const floorMicros = toMicros(rule.floor);
    if (amountMicros < floorMicros) {
      amountMicros = floorMicros;
      floored = true;
    }
  }
  return {
    amountMicros,
    rule: kind,
    ruleId: rule.id || null,
    label: rule.label || null,
    detail: {
      mode: "percent",
      value: rule.value,
      floor: rule.floor !== undefined ? rule.floor : null,
      floored,
    },
  };
}

/**
 * يحسب هامش Migo على التكلفة الكلية.
 *
 * @param {bigint|string|number} totalCost — التكلفة الكلية (BigInt ميكرو أو نص/رقم).
 * @param {object} [options]
 * @param {Array}  [options.tiers]       — الشرائح (افتراضيًا المعتمدة).
 * @param {object} [options.override]    — قاعدة مخصّصة للامتداد (أعلى أولوية).
 * @param {object} [options.zeroCost]    — { allow: boolean } للتكلفة الصفرية.
 * @returns {{amountMicros: bigint, rule: string, ruleId: string|null, detail: object}}
 */
export function computeMargin(totalCost, options = {}) {
  const { tiers = DEFAULT_TIERS, override = null, zeroCost = ZERO_COST_POLICY } = options;

  let totalMicros;
  try {
    totalMicros = typeof totalCost === "bigint" ? totalCost : toMicros(totalCost);
  } catch (err) {
    if (err instanceof DecimalError) {
      throw new MarginError("تكلفة غير صحيحة: " + err.message, "COST_INVALID");
    }
    throw err;
  }

  if (totalMicros < 0n) {
    throw new MarginError("التكلفة لا تكون سالبة", "COST_NEGATIVE");
  }

  if (totalMicros === 0n) {
    if (override) return applyRule(validateRule(override, "tldOverride"), totalMicros, "tld_override");
    if (!zeroCost.allow) {
      throw new MarginError(
        "التكلفة صفر بدون قرار تسعير صريح (قرار P3 معلّق)، ويُمنع اختلاق هامش.",
        "ZERO_COST_REQUIRES_DECISION",
        { cost: "0" }
      );
    }
  }

  if (override) {
    return applyRule(validateRule(override, "tldOverride"), totalMicros, "tld_override");
  }

  const tier = pickTier(totalMicros, tiers);
  return applyRule(validateRule(tier, "tier"), totalMicros, "tier");
}

/**
 * التسعير الكامل: تكلفة كلية → هامش → سعر بيع.
 * بيرجّع قيم الميكرو الخام (بدون تقريب للعرض) + الوسم اللي اتطبّق.
 */
export function priceFromCost(totalCost, options = {}) {
  const totalMicros = typeof totalCost === "bigint" ? totalCost : toMicros(totalCost);
  const margin = computeMargin(totalMicros, options);
  return {
    totalCostMicros: totalMicros,
    marginMicros: margin.amountMicros,
    saleMicros: totalMicros + margin.amountMicros,
    marginRule: margin.rule,
    marginRuleId: margin.ruleId,
    marginLabel: margin.label,
    marginDetail: margin.detail,
  };
}

/** يتحقق إن هامش المزوّد لا يظهر للعميل: أي مفتاح محظور في كائن العرض. */
const CLIENT_FORBIDDEN_KEYS = Object.freeze([
  "cost",
  "costs",
  "totalCost",
  "totalCostUsd",
  "wholesale",
  "wholesaleCost",
  "fees",
  "providerFees",
  "margin",
  "marginUsd",
  "marginDetail",
  "marginRule",
  "marginRuleId",
  "ruleDetail",
]);

/**
 * يتأكد إن كائن العرض (اللي هيوصل للعميل) مفيه ولا مفتاح من مفاتيح
 * التكلفة أو الهامش. بيرمي لو لقى أي واحد.
 */
export function assertClientSafe(obj, path = "quote") {
  if (obj === null || typeof obj !== "object") return obj;
  for (const key of Object.keys(obj)) {
    if (CLIENT_FORBIDDEN_KEYS.includes(key)) {
      throw new MarginError(
        "مفتاح ممنوع في عرض العميل: " + path + "." + key,
        "CLIENT_LEAK",
        { path: path + "." + key }
      );
    }
    assertClientSafe(obj[key], path + "." + key);
  }
  return obj;
}

export { maxBig, MarginError };
