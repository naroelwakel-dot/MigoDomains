/* ==========================================================================
   Migo Domains — نقطة دخول Cloudflare Worker
   --------------------------------------------------------------------------
   الربط بين بيئة الـWorker وبين التطبيق. القواعد:
     • المزوّد الحقيقي (Openprovider) **مقفول** لحد ما صاحب المشروع يفعّله
       ويدّي بيانات الاعتماد. لحد ساعتها الوضع الافتراضي هو المزوّد الوهمي
       المحلي (وده اللي بيتحكم فيه `FEATURES.realRegistrar` في الإعدادات).
     • كل السرّ ييجي من `env` (Secrets)، ومافيش أي سرّ مكتوب في الكود.
     • مفتاح الخدمة (Service Role) **ممنوع** يظهر هنا نهائيًا.
   ========================================================================== */

import { createApp } from "./app.js";
import { createBackendService, createPaymentGateway } from "../../backend/lib/index.js";
import { createMockProvider } from "../../providers/lib/mock.js";

/** يبني طبقة الخدمة من بيئة الـWorker. */
export function buildService(env = {}) {
  // المزوّد الحقيقي يتفعّل صريحًا وبشروط (شوف FEATURES في config/).
  const provider = env.MIGO_REGISTRAR === "openprovider" ? null : createMockProvider({ seed: 1 });
  if (!provider) {
    throw new Error("مزوّد التسجيل الحقيقي مش مربوط بعد — لسه محتاج حساب وبيانات اعتماد معتمدة.");
  }

  const payments = env.MIGO_PAYMENT_SECRET ? createPaymentGateway({ secret: env.MIGO_PAYMENT_SECRET }) : null;

  return createBackendService({
    provider,
    payments,
    config: { limits: { search: { maxNames: Number(env.MIGO_MAX_NAMES || 20), maxTlds: Number(env.MIGO_MAX_TLDS || 12) } } },
  });
}

export function buildApp(env = {}) {
  const allowedOrigins = String(env.MIGO_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return createApp({
    service: buildService(env),
    config: { allowedOrigins, trustDevClaims: env.MIGO_ENV !== "production" },
  });
}

export default {
  async fetch(request, env) {
    // البناء لكل طلب: في الإنتاج الشغل الحقيقي (قاعدة البيانات) بيتشارك في
    // موديول خارجي، لكن الأبسط هنا إن كل طلب ياخد حالته النظيفة.
    const app = buildApp(env || {});
    return app.handle(request);
  },
};
