/* ==========================================================================
   Migo Domains — إعدادات محرك التسعير
   --------------------------------------------------------------------------
   **قاعدة صارمة:** كل قيمة هنا إما (أ) جزء من السياسة المعتمدة، أو
   (ب) افتراضي معلَّم بوضوح إنه محتاج قرار من صاحب المشروع (P2–P6).

   ممنوع هنا: أي سعر صرف ثابت، أي مفتاح، أي تكلفة مورّد مكتوبة يدويًا.
   ========================================================================== */

import { DEFAULT_TIERS } from "./tiers.js";
import { FX_DEFAULT_MAX_AGE_MS, FX_DEFAULT_BUFFER_PERCENT } from "./fx.js";
import { COST_MAX_AGE_MS, COST_CHANGE_TOLERANCE_PERCENT } from "./cost-feed.js";

/** العمليات المدعومة. كل عملية بتتسعّر من تكلفتها المستقلة (سياسة معتمدة). */
export const OPERATIONS = Object.freeze(["registration", "renewal", "transfer"]);

/**
 * الإعدادات الافتراضية.
 * الحقول المعلَّمة بـ"PENDING" افتراضات آمنة لحد قرار صاحب المشروع،
 * و**ممنوع** تفسيرها كقرار مُعتمد.
 */
export const DEFAULT_CONFIG = Object.freeze({
  /** الشرائح المعتمدة — إلزامية من السياسة. */
  tiers: DEFAULT_TIERS,

  /** تجاوزات الامتدادات: { "com": { mode:"flat", value:"5.00" } } — أعلى أولوية. */
  tldOverrides: Object.freeze({}),

  /** التقريب النهائي للعرض — يُضبط من الإدارة، ولا يُثبَّت في الكود. */
  rounding: Object.freeze({
    usdDecimals: 2,
    egpDecimals: 2,
    mode: "half-up",
  }),

  /** تثبيت عرض السعر. */
  quote: Object.freeze({
    /** مدة القفل — مثال السياسة: 15 دقيقة. */
    lockMs: 15 * 60 * 1000,
    /** إظهار EGP في العروض. */
    includeEgp: true,
  }),

  /** سعر الصرف. */
  fx: Object.freeze({
    maxAgeMs: FX_DEFAULT_MAX_AGE_MS,
    /** PENDING (P6): هامش تقلّب FX — الافتراضي صفر لحد القرار. */
    bufferPercent: FX_DEFAULT_BUFFER_PERCENT,
  }),

  /** تكلفة المورّد. */
  cost: Object.freeze({
    maxAgeMs: COST_MAX_AGE_MS,
    /** PENDING: حساسية تنبيه تغيّر التكلفة. */
    changeTolerancePercent: COST_CHANGE_TOLERANCE_PERCENT,
  }),

  /** التكلفة الصفرية (PENDING — P3). الافتراضي: رفض التسعير. */
  zeroCost: Object.freeze({ allow: false }),

  /**
   * Premium Domains (PENDING — P5): مفيش تسعير مستقل متّفق عليه،
   * فالافتراضي رفض. أي تسعير premium لازم استراتيجية صريحة من الإدارة.
   */
  premium: Object.freeze({ configured: false, strategy: null }),

  /** تسعير العمليات المنفصلة (PENDING — P2/P4). لا افتراضات هنا. */
  operations: Object.freeze({
    transferBaseOnRenewal: null, // P2 لم يُقرَّر
    separateTransferLine: null,  // P4 لم يُقرَّر
  }),
});

/**
 * دمج إعدادات جزئية فوق الافتراضية (دمج سطحي لكل قسم).
 * مفيش دمج عميق مقصود: عشان نمنع تكوين حالة غامضة بالغلط.
 */
export function mergeConfig(overrides = {}) {
  const out = {};
  for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
    if (overrides[key] === undefined) {
      out[key] = value;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = Object.assign({}, value, overrides[key]);
    } else {
      out[key] = overrides[key];
    }
  }
  return out;
}

/** التحقق من الإعدادات: بيرمي لو لقى حاجة ممنوعة أو غلط. */
export function validateConfig(config) {
  const problems = [];

  if (!Array.isArray(config.tiers) || config.tiers.length === 0) {
    problems.push("الشرائح فاضية أو غير صحيحة.");
  }
  const r = config.rounding || {};
  for (const key of ["usdDecimals", "egpDecimals"]) {
    if (!Number.isInteger(r[key]) || r[key] < 0 || r[key] > 6) {
      problems.push("خانات تقريب غير صحيحة: " + key);
    }
  }
  if (config.quote && (!Number.isFinite(config.quote.lockMs) || config.quote.lockMs <= 0)) {
    problems.push("مدة قفل عرض السعر غير صحيحة.");
  }
  if (config.fx && !Number.isFinite(config.fx.maxAgeMs)) {
    problems.push("أقصى عمر لسعر الصرف غير صحيح.");
  }

  if (problems.length > 0) {
    const err = new Error("إعدادات تسعير غير صحيحة: " + problems.join(" | "));
    err.code = "CONFIG_INVALID";
    err.problems = problems;
    throw err;
  }
  return true;
}
