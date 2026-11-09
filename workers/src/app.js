/* ==========================================================================
   Migo Domains — تطبيق الـAPI
   --------------------------------------------------------------------------
   طبقة رقيقة (Thin Layer) فوق منطق الخدمة:
     • جدول مسارات صريح بدل routing ضمني.
     • فحص الصلاحية **قبل** أي منطق.
     • ردود موحّدة + هيدرز أمان على كل رد.
     • مفيش أي سرّ مخزّن هنا؛ كل حاجة تيجي من البيئة.

   التصميم: `createApp({ service })` نقي (مفيش أي اعتماد على Cloudflare)،
   فالاختبارات تشتغل في Node مباشرة، و`index.js` هو اللي بيربط البيئة.
   ========================================================================== */

import { matchRoute } from "./router.js";
import { ServiceError, SERVICE_ERROR_CODES as C, statusForCode } from "../../backend/lib/index.js";

export const SECURITY_HEADERS = Object.freeze({
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
});

/** استخراج المطالبات (claims) — في الإنتاج تتأكد من توقيع JWT من Supabase. */
export function claimsFrom(request, { trustDevClaims = false } = {}) {
  const devClaims = request.headers.get("x-migo-claims");
  if (devClaims && trustDevClaims) {
    try {
      return JSON.parse(devClaims);
    } catch {
      return null;
    }
  }
  const auth = request.headers.get("authorization");
  if (auth && /^Bearer\s+/i.test(auth)) {
    const token = auth.replace(/^Bearer\s+/i, "");
    try {
      const payload = JSON.parse(atob(token.split(".")[1] || ""));
      return { sub: payload.sub, role: payload.role, verified: false };
    } catch {
      return null;
    }
  }
  return null;
}

function baseHeaders(request, allowedOrigins) {
  const headers = { ...SECURITY_HEADERS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  const origin = request.headers.get("origin");
  if (origin && (allowedOrigins.includes("*") || allowedOrigins.includes(origin))) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-headers"] = "content-type, authorization, x-migo-claims, x-migo-signature, x-idempotency-key";
    headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
    headers["vary"] = "origin";
  }
  return headers;
}

function json(body, status, request, allowedOrigins) {
  return new Response(JSON.stringify(body), { status, headers: baseHeaders(request, allowedOrigins) });
}

function fail(err, request, allowedOrigins) {
  if (err instanceof ServiceError) {
    return json({ ok: false, error: { code: err.code, message: err.message } }, statusForCode(err.code), request, allowedOrigins);
  }
  // لا نسرّب تفاصيل داخلية للعميل.
  return json({ ok: false, error: { code: "INTERNAL", message: "خطأ غير متوقع" } }, 500, request, allowedOrigins);
}

export function createApp({ service, config = {} } = {}) {
  if (!service) throw new Error("التطبيق محتاج طبقة الخدمة");
  const allowedOrigins = config.allowedOrigins || [];
  const trustDevClaims = config.trustDevClaims === true;

  async function handle(request) {
    const method = request.method.toUpperCase();
    const url = new URL(request.url);

    if (method === "OPTIONS") return new Response(null, { status: 204, headers: baseHeaders(request, allowedOrigins) });

    const matched = matchRoute(method, url.pathname);
    if (!matched) return json({ ok: false, error: { code: C.NOT_FOUND, message: "مسار غير معروف" } }, 404, request, allowedOrigins);

    const { route, params } = matched;
    const claims = claimsFrom(request, { trustDevClaims });

    if (route.auth === "user" && (!claims || !claims.sub)) {
      return json({ ok: false, error: { code: C.UNAUTHENTICATED, message: "لازم تسجيل الدخول" } }, 401, request, allowedOrigins);
    }
    if (route.auth === "admin" && (!claims || claims.role !== "admin")) {
      return json({ ok: false, error: { code: C.FORBIDDEN, message: "العملية دي للإدارة بس" } }, 403, request, allowedOrigins);
    }

    try {
      switch (route.id) {
        case "health":
          return json({ ok: true, service: "migo-domains", time: new Date().toISOString() }, 200, request, allowedOrigins);

        case "search": {
          const body = await readJson(request);
          return json({ ok: true, results: await service.search({ names: body.names || [], tlds: body.tlds || [], claims }) }, 200, request, allowedOrigins);
        }
        case "availability": {
          const body = await readJson(request);
          return json({ ok: true, result: await service.checkAvailability(body.domain, { claims }) }, 200, request, allowedOrigins);
        }
        case "quote": {
          const body = await readJson(request);
          const out = await service.quote({ domain: body.domain, operation: body.operation, fx: body.fx || null, allowMock: body.allowMock === true, claims });
          return json(out, out.ok === false ? 409 : 200, request, allowedOrigins);
        }
        case "order.create": {
          const body = await readJson(request);
          const order = await service.createOrder({
            domain: body.domain,
            operation: body.operation,
            years: body.years || 1,
            registrant: body.registrant,
            fx: body.fx || null,
            allowMock: body.allowMock === true,
            idempotencyKey: request.headers.get("x-idempotency-key") || body.idempotencyKey,
            claims,
          });
          return json({ ok: true, order }, 201, request, allowedOrigins);
        }
        case "order.list":
          return json({ ok: true, orders: service.listOrders(claims) }, 200, request, allowedOrigins);
        case "order.get":
          return json({ ok: true, order: service.getOrder(params.orderId, claims) }, 200, request, allowedOrigins);
        case "payment.intent": {
          const body = await readJson(request);
          return json({ ok: true, intent: service.createPaymentIntent({ orderId: body.orderId, claims }) }, 201, request, allowedOrigins);
        }
        case "payment.webhook": {
          const raw = await request.text();
          const signature = request.headers.get("x-migo-signature");
          const order = await service.confirmPayment({ rawBody: raw, signature });
          return json({ ok: true, order }, 200, request, allowedOrigins);
        }
        case "dns.set": {
          const body = await readJson(request);
          return json(await service.setNameservers({ domain: body.domain, nameservers: body.nameservers, claims }), 200, request, allowedOrigins);
        }
        default:
          return json({ ok: false, error: { code: C.NOT_FOUND, message: "مسار غير معروف" } }, 404, request, allowedOrigins);
      }
    } catch (err) {
      return fail(err, request, allowedOrigins);
    }
  }

  return { handle, config: Object.freeze({ allowedOrigins, trustDevClaims }) };
}

async function readJson(request) {
  try {
    const text = await request.text();
    return text ? JSON.parse(text) : {};
  } catch {
    throw new ServiceError("جسم الطلب مش JSON صالح", C.VALIDATION);
  }
}
