/* ==========================================================================
   Migo Domains — مزوّد دفع وهمي + تحقّق من توقيع الـWebhook
   --------------------------------------------------------------------------
   بوابة الدفع الحقيقية **لسه مش مختارة** (قرار صاحب المشروع E)، فالمطلوب
   هنا: شكل الشغل الصح، مش ربط ببوابة بعينها.

   الحماية الأساسية: أي إشعار دفع (Webhook) **ممنوع** يتقبل بدون توقيع
   HMAC صالح. وده اللي بيمنع حد من بره إنه يقول «الطلب ده مدفوع».

   التوقيع بـ HMAC-SHA256 عبر Web Crypto (متاح في Node 20+ وWorkers)، فمفيش
   مكتبات خارجية ومفيش مفاتيح مكتوبة في الكود — السرّ بيتمرّر من الإعدادات.
   ========================================================================== */

import { ServiceError, SERVICE_ERROR_CODES } from "./errors.js";

export const PAYMENT_STATUSES = Object.freeze({
  PENDING: "PENDING",
  PAID: "PAID",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
  REFUNDED: "REFUNDED",
});

const encoder = new TextEncoder();

async function hmacHex(secret, message) {
  const key = await globalThis.crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * @param {object} opts
 * @param {string} opts.secret  سرّ التحقق من التوقيع (من الإعدادات، مش من الكود).
 */
export function createPaymentGateway({ secret, now = () => new Date(), toleranceMs = 5 * 60 * 1000 } = {}) {
  if (!secret || typeof secret !== "string") throw new Error("مزوّد الدفع محتاج سرّ للتحقق من التوقيع");

  const intents = new Map();

  /** ينشئ نية دفع مربوط بطلب. المبلغ بالسنت (integer) ونوع العملة. */
  function createIntent({ orderId, amount, currency }) {
    if (!Number.isInteger(amount) || amount < 0) throw new ServiceError("مبلغ غير صالح", SERVICE_ERROR_CODES.VALIDATION);
    const intentId = "pi_" + Math.random().toString(36).slice(2, 12);
    const intent = Object.freeze({
      intentId,
      orderId,
      amount,
      currency: currency || "EGP",
      status: PAYMENT_STATUSES.PENDING,
      createdAt: now().toISOString(),
    });
    intents.set(intentId, intent);
    return intent;
  }

  /** يوقّع حدث (للاختبار وللمحاكاة). الإنتاج: البوابة هي اللي توقّع. */
  async function sign(eventBody) {
    const raw = typeof eventBody === "string" ? eventBody : JSON.stringify(eventBody);
    return hmacHex(secret, raw);
  }

  /**
   * يحقّق من إشعار دفع.
   * @returns {Promise<{ok:boolean, event?:object, reason?:string}>}
   */
  async function verifyWebhook(rawBody, signature) {
    if (!rawBody || !signature) return { ok: false, reason: "MISSING_SIGNATURE" };
    const expected = await hmacHex(secret, typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody));
    if (!timingSafeEqual(expected, String(signature))) return { ok: false, reason: "BAD_SIGNATURE" };

    let event;
    try {
      event = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
    } catch {
      return { ok: false, reason: "BAD_BODY" };
    }
    if (!event || event.type !== "payment.succeeded" || !event.orderId) {
      return { ok: false, reason: "UNSUPPORTED_EVENT" };
    }
    if (toleranceMs && event.occurredAt) {
      const age = now().getTime() - new Date(event.occurredAt).getTime();
      if (!Number.isFinite(age) || Math.abs(age) > toleranceMs) return { ok: false, reason: "TIMESTAMP_OUT_OF_TOLERANCE" };
    }
    const intent = intents.get(event.intentId);
    if (intent) intents.set(event.intentId, Object.freeze({ ...intent, status: PAYMENT_STATUSES.PAID }));
    return { ok: true, event };
  }

  return { createIntent, sign, verifyWebhook, getIntent: (id) => intents.get(id) || null };
}
