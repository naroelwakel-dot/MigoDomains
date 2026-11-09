/* ==========================================================================
   Migo Domains — ضمان التنفيذ مرة واحدة (Idempotency)
   --------------------------------------------------------------------------
   القاعدة المطلوبة حرفيًا: «نفس المفتاح + نفس الطلب = نفس النتيجة»،
   و«نفس المفتاح + طلب مختلف = رفض IDEMPOTENCY_CONFLICT».

   المفتاح بيجي في هيدر/جسم الطلب. البصمة (fingerprint) بتتولّد من الطلب
   نفسه، فأي فرق في الطلب مع نفس المفتاح = خطأ صريح، مش تنفيذ تاني.
   ========================================================================== */

import { ServiceError, SERVICE_ERROR_CODES } from "./errors.js";

export function fingerprint(input) {
  return JSON.stringify(sortKeys(input));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
    return out;
  }
  return value;
}

export function createIdempotencyStore({ now = () => Date.now() } = {}) {
  const store = new Map();

  async function remember(key, fp, fn) {
    if (!key) return fn();
    const existing = store.get(key);
    if (existing) {
      if (existing.fingerprint !== fp) {
        throw new ServiceError("نفس المفتاح مستخدم بطلب مختلف", SERVICE_ERROR_CODES.IDEMPOTENCY_CONFLICT, { key });
      }
      return existing.value;
    }
    const promise = Promise.resolve().then(fn);
    store.set(key, { fingerprint: fp, value: promise, at: now() });
    try {
      return await promise;
    } catch (err) {
      store.delete(key); // الفشل مش نتيجة — نسمح بإعادة المحاولة
      throw err;
    }
  }

  return {
    remember,
    has: (key) => store.has(key),
    get size() {
      return store.size;
    },
    clear: () => store.clear(),
  };
}
