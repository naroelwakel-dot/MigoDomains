/* ==========================================================================
   Migo Domains — تغذية التكلفة من المورّد
   --------------------------------------------------------------------------
   متطلبات المحرك (docs/phase-zero/PRICING_ENGINE_REVIEW.md):
     • تحديث أسعار المورّد **كل 6 ساعات** عند توفر مصدر موثوق.
     • حفظ تاريخ كل تحديث + المصدر + وقت آخر تحديث.
     • اكتشاف تغيّر التكلفة وإرسال تنبيه للإدارة.
     • **ممنوع** إصدار سعر حقيقي عند غياب تكلفة موثوقة.
     • **ممنوع** استخدام أسعار وهمية كأسعار حقيقية.

   الملف ده مسؤول عن الجزء ده كله — وهو منفصل عن حساب الهامش عشان نقدر
   نختبره لوحده.
   ========================================================================== */

import { toMicros, toDecimalString, toFixedString, divRoundHalfUp, MICRO, DecimalError } from "./decimal.js";

/** الفاصل المطلوب بين تحديثين — 6 ساعات. */
export const COST_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** أقصى عمر مقبول لتكلفة قبل ما نرفض التسعير عليها. */
export const COST_MAX_AGE_MS = COST_REFRESH_INTERVAL_MS;

/** حساسية اكتشاف تغيّر التكلفة (نسبة مئوية). صفر = أي تغيّر يستحق تنبيه. */
export const COST_CHANGE_TOLERANCE_PERCENT = "0";

export const COST_REASONS = Object.freeze({
  MISSING: "COST_MISSING",
  NO_SOURCE: "COST_NO_SOURCE",
  NO_TIMESTAMP: "COST_NO_TIMESTAMP",
  FROM_FUTURE: "COST_FROM_FUTURE",
  STALE: "COST_STALE",
  INVALID: "COST_INVALID",
  UNTRUSTED: "COST_UNTRUSTED",
});

const MESSAGES = {
  COST_MISSING: "مفيش تكلفة مورّد متاحة.",
  COST_NO_SOURCE: "التكلفة بدون مصدر موثّق.",
  COST_NO_TIMESTAMP: "التكلفة بدون وقت جلب.",
  COST_FROM_FUTURE: "وقت جلب التكلفة في المستقبل — قيمة مرفوضة.",
  COST_STALE: "التكلفة قديمة (أقدم من 6 ساعات)، ويُمنع إصدار سعر عليها.",
  COST_INVALID: "بيانات التكلفة غير صحيحة.",
  COST_UNTRUSTED: "مصدر التكلفة غير موثوق.",
};

/**
 * يبني لقطة تكلفة مجمّدة (immutable snapshot) من بيانات المورّد.
 * @param {object} input
 * @param {string|number|bigint} input.wholesale — سعر المورّد بالجملة.
 * @param {string|number|bigint} [input.fees]   — رسوم المورّد.
 * @param {string} [input.currency]             — افتراضيًا USD.
 * @param {string} input.source                 — مصدر البيانات (إلزامي).
 * @param {Date|string} [input.retrievedAt]     — وقت الجلب.
 * @param {boolean} [input.trusted]             — افتراضيًا true.
 */
export function makeCostSnapshot(input = {}) {
  const {
    wholesale,
    fees = "0",
    currency = "USD",
    source,
    retrievedAt = new Date(),
    trusted = true,
  } = input;

  if (source === undefined || source === null || source === "") {
    throw new Error("لقطة التكلفة لازم يكون لها مصدر موثّق (COST_NO_SOURCE)");
  }
  if (String(currency).toUpperCase() !== "USD") {
    throw new Error("الحساب الداخلي بالدولار فقط، والمتلقّي: " + currency);
  }

  const when = retrievedAt instanceof Date ? retrievedAt : new Date(retrievedAt);
  if (Number.isNaN(when.getTime())) throw new Error("وقت جلب التكلفة غير صحيح");

  const wholesaleMicros = toMicros(wholesale);
  const feesMicros = toMicros(fees);
  if (wholesaleMicros < 0n || feesMicros < 0n) {
    throw new Error("التكلفة لا تكون سالبة");
  }

  return Object.freeze({
    wholesaleMicros,
    feesMicros,
    totalMicros: wholesaleMicros + feesMicros,
    currency: "USD",
    source: String(source),
    retrievedAt: when.toISOString(),
    trusted: trusted !== false,
  });
}

/** عرض اللقطة كنص (للتسجيل والمقارنة). */
export function snapshotToRecord(snapshot) {
  if (!snapshot) return null;
  return {
    wholesaleUsd: toDecimalString(snapshot.wholesaleMicros),
    feesUsd: toDecimalString(snapshot.feesMicros),
    totalUsd: toDecimalString(snapshot.totalMicros),
    currency: snapshot.currency,
    source: snapshot.source,
    retrievedAt: snapshot.retrievedAt,
    trusted: snapshot.trusted,
  };
}

/**
 * يتحقق إن التكلفة طازجة وموثوقة وآمنة للتسعير عليها.
 * @returns {{ok: true, ageMs: number} | {ok: false, reason: string, message: string}}
 */
export function checkCostFreshness(snapshot, { now = new Date(), maxAgeMs = COST_MAX_AGE_MS } = {}) {
  const fail = (reason, extra = {}) => ({
    ok: false,
    reason,
    message: MESSAGES[reason] || "التكلفة غير صالحة.",
    ...extra,
  });

  if (!snapshot) return fail(COST_REASONS.MISSING);
  if (snapshot.trusted === false) return fail(COST_REASONS.UNTRUSTED);
  if (!snapshot.source) return fail(COST_REASONS.NO_SOURCE);
  if (!snapshot.retrievedAt) return fail(COST_REASONS.NO_TIMESTAMP);
  if (typeof snapshot.totalMicros !== "bigint") return fail(COST_REASONS.INVALID);

  const when = new Date(snapshot.retrievedAt);
  if (Number.isNaN(when.getTime())) return fail(COST_REASONS.NO_TIMESTAMP);

  const ageMs = now.getTime() - when.getTime();
  if (ageMs < 0) return fail(COST_REASONS.FROM_FUTURE, { ageMs });
  if (ageMs > maxAgeMs) return fail(COST_REASONS.STALE, { ageMs, maxAgeMs });

  return { ok: true, ageMs, maxAgeMs };
}

/** هل حان وقت التحديث؟ (الفاصل 6 ساعات). */
export function needsRefresh(lastRetrievedAt, { now = new Date(), intervalMs = COST_REFRESH_INTERVAL_MS } = {}) {
  if (!lastRetrievedAt) return true;
  const when = lastRetrievedAt instanceof Date ? lastRetrievedAt : new Date(lastRetrievedAt);
  if (Number.isNaN(when.getTime())) return true;
  return now.getTime() - when.getTime() >= intervalMs;
}

/** يحسب نسبة التغيّر المئوية بين قيمتين (نص مئوي بدقة 6 خانات). */
export function changePercent(prevMicros, nextMicros) {
  if (prevMicros === 0n) {
    if (nextMicros === 0n) return "0";
    return null; // تغيّر من صفر → نسبة غير معرّفة
  }
  const delta = nextMicros - prevMicros;
  const pctMicros = divRoundHalfUp(delta * 100n * MICRO, prevMicros);
  return toDecimalString(pctMicros);
}

/**
 * يقارن لقطة تكلفة قديمة بأخرى جديدة، ويرجّع التنبيهات المطلوبة للإدارة.
 * مش بيمنع أي حاجة — قرار التسعير بيتاخد في مكان تاني.
 */
export function detectCostChange(prev, next, { tolerancePercent = COST_CHANGE_TOLERANCE_PERCENT } = {}) {
  const alerts = [];

  if (!prev) {
    return {
      changed: true,
      first: true,
      direction: "new",
      deltaTotalMicros: next ? next.totalMicros : 0n,
      deltaPercent: null,
      alerts: [
        {
          code: "COST_BASELINE_SET",
          severity: "info",
          message: "أول تسجيل لتكلفة المورّد — ده خط الأساس للمقارنات الجاية.",
        },
      ],
    };
  }

  const delta = next.totalMicros - prev.totalMicros;
  const deltaPercent = changePercent(prev.totalMicros, next.totalMicros);
  const toleranceMicros = toMicros(tolerancePercent);

  let changed = delta !== 0n;
  if (changed && deltaPercent !== null) {
    const absPct = deltaPercent.startsWith("-") ? toMicros(deltaPercent.slice(1)) : toMicros(deltaPercent);
    if (absPct <= toleranceMicros) changed = false;
  }

  if (changed) {
    const up = delta > 0n;
    // النسبة الخام تفضل محفوظة، ونص التنبيه بيتقرّب لخانتين عشان يبقى مقروء.
    const shownPercent = deltaPercent === null ? "(تغيّر من صفر)" : toFixedString(toMicros(deltaPercent), 2) + "%";
    alerts.push({
      code: up ? "COST_INCREASED" : "COST_DECREASED",
      severity: up ? "warning" : "info",
      message:
        (up ? "تكلفة المورّد زادت " : "تكلفة المورّد قلت ") +
        shownPercent +
        " → من " + toDecimalString(prev.totalMicros) + " لـ " + toDecimalString(next.totalMicros) + " USD.",
      previousTotalUsd: toDecimalString(prev.totalMicros),
      nextTotalUsd: toDecimalString(next.totalMicros),
    });
  }

  if (prev.source !== next.source) {
    alerts.push({
      code: "COST_SOURCE_CHANGED",
      severity: "warning",
      message: "مصدر التكلفة اتغيّر: " + prev.source + " → " + next.source + ".",
      previousSource: prev.source,
      nextSource: next.source,
    });
  }

  return {
    changed,
    first: false,
    direction: delta === 0n ? "same" : delta > 0n ? "up" : "down",
    deltaTotalMicros: delta,
    deltaPercent,
    alerts,
  };
}

/**
 * قرار تحديث التغذية: هل نجلب؟ وهل التغيير يستحق تنبيه؟
 * بيرجّع { action: "fetch" | "skip", reason, alerts }
 */
export function planRefresh(lastSnapshot, { now = new Date(), intervalMs = COST_REFRESH_INTERVAL_MS } = {}) {
  if (!lastSnapshot || needsRefresh(lastSnapshot.retrievedAt, { now, intervalMs })) {
    return { action: "fetch", reason: lastSnapshot ? "REFRESH_DUE" : "NO_BASELINE", alerts: [] };
  }
  return { action: "skip", reason: "FRESH_ENOUGH", alerts: [] };
}

export { DecimalError };
