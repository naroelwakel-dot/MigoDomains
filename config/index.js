/* ==========================================================================
   Migo Domains — إعدادات المشروع
   --------------------------------------------------------------------------
   هنا الحدود والقيم الافتراضية بس (Rate Limiting · مدد الـCache · مفاتيح
   الميزات).

   **ممنوع تمامًا** في الملف ده:
     • أي مفتاح أو سرّ (تحقق آلي في `assertNoSecrets`).
     • أي سعر صرف ثابت (سعر الصرف يجي من `pricing/lib/fx.js` بتوقيت ومصدر).
     • أي تكلفة مورّد مكتوبة يدويًا.

   قيم `FEATURES` كلها `false` افتراضيًا — يعني المنصة مقفولة على الوضع
   المحلي لحد ما صاحب المشروع يفتح كل حاجة بموافقة منفصلة.
   ========================================================================== */

export const ENVIRONMENTS = Object.freeze(["development", "staging", "production"]);

/** الحدود التشغيلية. كلها قابلة للتعديل من الإدارة، مش مثبّتة في منطق الكود. */
export const LIMITS = Object.freeze({
  search: Object.freeze({ maxNames: 20, maxTlds: 12 }),
  rateLimit: Object.freeze({
    availability: Object.freeze({ capacity: 30, refillPerSecond: 0.5 }),
    registrar: Object.freeze({ capacity: 10, refillPerSecond: 0.2 }),
    quote: Object.freeze({ capacity: 60, refillPerSecond: 1 }),
  }),
  availabilityCache: Object.freeze({
    definitiveTtlMs: 5 * 60 * 1000,
    unknownTtlMs: 30 * 1000,
    maxEntries: 5000,
  }),
  rdap: Object.freeze({ timeoutMs: 8000, maxRedirects: 3 }),
});

/**
 * مفاتيح الميزات. كلها `false`: الوضع الآمن افتراضيًا.
 * فتح أي واحدة **قرار صاحب المشروع**، ومش بيحصل من الكود.
 */
export const FEATURES = Object.freeze({
  realRegistrar: false, // Openprovider حقيقي — محتاج حساب وبيانات اعتماد
  payments: false, // بوابة دفع حقيقية — لسه مش مختارة
  advancedDns: false, // خطة DNS مدفوعة — لسه بلا تسعير معتمد
  adminWrites: false, // كتابة فعلية من لوحة الإدارة — محتاجة RLS مُنفَّذة
});

const SECRET_LIKE = /(secret|token|password|passwd|apikey|api_key|api-key|service_role|service-role|dsn|private_key)/i;

/** يمشي على الإعدادات كلها ويرمي لو لقى أي اسم حقل شبه سرّي. */
export function assertNoSecrets(obj, path = "config", seen = new Set()) {
  if (obj === null || typeof obj !== "object") return true;
  if (seen.has(obj)) return true;
  seen.add(obj);
  for (const [key, value] of Object.entries(obj)) {
    if (SECRET_LIKE.test(key)) {
      throw new Error("ممنوع أي سرّ في الإعدادات: " + path + "." + key);
    }
    if (value && typeof value === "object") assertNoSecrets(value, path + "." + key, seen);
  }
  return true;
}

function mergeSection(base, overrides) {
  if (!overrides) return base;
  const unknown = Object.keys(overrides).filter((k) => !(k in base));
  if (unknown.length > 0) throw new Error("مفاتيح إعدادات غير معروفة: " + unknown.join(", "));
  const out = {};
  for (const key of Object.keys(base)) {
    const b = base[key];
    const o = overrides[key];
    out[key] = o === undefined ? b : b && typeof b === "object" && !Array.isArray(b) ? Object.assign({}, b, o) : o;
  }
  return Object.freeze(out);
}

/**
 * يبني إعدادات نهائية لبيئة معيّنة.
 * @param {object} [overrides]  { limits, features }
 * @param {{env?: string}} [opts]
 */
export function loadConfig(overrides = {}, { env = "development" } = {}) {
  if (!ENVIRONMENTS.includes(env)) throw new Error("بيئة غير معروفة: " + env);
  const config = {
    env,
    limits: mergeSection(LIMITS, overrides.limits),
    features: mergeSection(FEATURES, overrides.features),
  };
  assertNoSecrets(config);
  return Object.freeze(config);
}

export default loadConfig;
