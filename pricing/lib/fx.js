/* ==========================================================================
   Migo Domains — سعر الصرف (USD → EGP)
   --------------------------------------------------------------------------
   قواعد السياسة المعتمدة:
     • ممنوع أي سعر صرف ثابت داخل الكود.
     • سعر الصرف يُثبَّت داخل عرض السعر لحظة إصداره ولا يتغيّر عليه.
     • لا تحديث لسعر الصرف أثناء عملية دفع جارية.
     • تُوقف عروض EGP إذا كان سعر الصرف قديمًا أو غير موثوق.
     • ممنوع اختلاق أي سعر صرف.

   النتيجة دايمًا كائن واضح: إما { ok: true, ... } أو { ok: false, reason }.
   الرفض مقصود ومش خطأ — معناها إننا ما نعرضش EGP، ونفضل نعرض USD.
   ========================================================================== */

import { toMicros, percentOf, divRoundHalfUp, MICRO, DecimalError } from "./decimal.js";

/** أقصى عمر مسموح لسعر الصرف قبل ما يتعتبر قديم. */
export const FX_DEFAULT_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 ساعات

/** هامش تقلّب FX — قرار P6 معلّق، والافتراضي **صفر** لحد ما يُقرَّر. */
export const FX_DEFAULT_BUFFER_PERCENT = "0";

/** أسباب رفض/إيقاف EGP. */
export const FX_REASONS = Object.freeze({
  MISSING: "FX_MISSING",
  INVALID: "FX_INVALID",
  UNTRUSTED: "FX_UNTRUSTED",
  NO_TIMESTAMP: "FX_NO_TIMESTAMP",
  FROM_FUTURE: "FX_FROM_FUTURE",
  STALE: "FX_STALE",
});

const MESSAGES = {
  FX_MISSING: "مفيش سعر صرف معتمد متاح.",
  FX_INVALID: "سعر الصرف غير صحيح.",
  FX_UNTRUSTED: "مصدر سعر الصرف غير موثوق.",
  FX_NO_TIMESTAMP: "سعر الصرف بدون وقت تحديث.",
  FX_FROM_FUTURE: "وقت تحديث سعر الصرف في المستقبل — قيمة مرفوضة.",
  FX_STALE: "سعر الصرف قديم، وعروض EGP موقوفة لحد التحديث.",
};

function reject(reason, extra = {}) {
  return { ok: false, reason, message: MESSAGES[reason] || "سعر الصرف غير متاح.", ...extra };
}

/**
 * يتحقق من صلاحية سعر الصرف.
 * @param {object} fx — { rate, source, fetchedAt, trusted? }
 * @param {object} [opts] — { now, maxAgeMs }
 */
export function resolveFx(fx, { now = new Date(), maxAgeMs = FX_DEFAULT_MAX_AGE_MS } = {}) {
  if (!fx || typeof fx !== "object") return reject(FX_REASONS.MISSING);

  const raw = fx.rate;
  if (raw === undefined || raw === null || raw === "") return reject(FX_REASONS.MISSING);

  let rateMicros;
  try {
    rateMicros = toMicros(raw);
  } catch (err) {
    if (err instanceof DecimalError) return reject(FX_REASONS.INVALID, { detail: err.message });
    throw err;
  }
  if (rateMicros <= 0n) return reject(FX_REASONS.INVALID);

  if (fx.trusted === false) return reject(FX_REASONS.UNTRUSTED);

  if (!fx.fetchedAt) return reject(FX_REASONS.NO_TIMESTAMP);
  const fetchedAt = fx.fetchedAt instanceof Date ? fx.fetchedAt : new Date(fx.fetchedAt);
  if (Number.isNaN(fetchedAt.getTime())) return reject(FX_REASONS.NO_TIMESTAMP);

  const ageMs = now.getTime() - fetchedAt.getTime();
  if (ageMs < 0) return reject(FX_REASONS.FROM_FUTURE, { ageMs });
  if (ageMs > maxAgeMs) return reject(FX_REASONS.STALE, { ageMs, maxAgeMs });

  return {
    ok: true,
    rateMicros,
    rate: fx.rate,
    source: fx.source ?? null,
    fetchedAt: fetchedAt.toISOString(),
    ageMs,
    maxAgeMs,
  };
}

/**
 * يحوّل مبلغ USD إلى EGP.
 * سعر البيع EGP = سعر البيع USD × سعر الصرف × (1 + هامش التقلّب/100)
 * الإخراج **غير مقرَّب** — التقريب بيتحدّد من إعدادات الإدارة عند العرض.
 */
export function convertToEgp(usdMicros, fx, options = {}) {
  const { now = new Date(), maxAgeMs, bufferPercent = FX_DEFAULT_BUFFER_PERCENT } = options;
  const resolved = resolveFx(fx, { now, maxAgeMs });
  if (!resolved.ok) return resolved;

  let egpMicros = divRoundHalfUp(usdMicros * resolved.rateMicros, MICRO);

  const bufferMicros = toMicros(bufferPercent);
  if (bufferMicros !== 0n) {
    egpMicros += percentOf(egpMicros, bufferPercent);
  }

  return {
    ok: true,
    egpMicros,
    rate: resolved.rate,
    source: resolved.source,
    fetchedAt: resolved.fetchedAt,
    ageMs: resolved.ageMs,
    bufferPercent: String(bufferPercent),
  };
}
