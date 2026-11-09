/* ==========================================================================
   Migo Domains — اختبار تكامل شامل (End-to-End)
   --------------------------------------------------------------------------
   بيمشي على المسار الحقيقي كامل: محرك التوفر (RDAP) → المزوّد → محرك التسعير
   → طبقة الخدمة → واجهة الـAPI. كله محلي: الشبكة قابلة للحقن، ومفيش أي
   اعتماد حقيقي ومفيش أي سعر حقيقي.
   ========================================================================== */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createAvailabilityEngine } from "../availability/lib/index.js";
import { parseBootstrap } from "../availability/lib/bootstrap.js";
import { createMockProvider } from "../providers/lib/mock.js";
import { createBackendService, createPaymentGateway } from "../backend/lib/index.js";
import { createApp } from "../workers/src/app.js";
import { loadConfig } from "../config/index.js";

const NOW = () => new Date("2026-11-09T10:00:00.000Z");
const USER = { sub: "user-1", role: "customer" };
const REGISTRANT = { name: "أحمد المصري", email: "ahmed@example.com", country: "EG" };

const bootstrap = parseBootstrap({ services: [[["com"], ["https://rdap.example/v1/"]]] });

/** fetch وهمي: يسجّل كل طلب ويرد بحسب ردّ مُعدّ مسبقًا. */
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const hit = routes.find((r) => url.includes(r.match));
    const status = hit ? hit.status : 404;
    return { status, headers: { get: () => null }, json: async () => (hit && hit.body) || {} };
  };
  fn.calls = calls;
  return fn;
}

function fullStack({ rdapRoutes = [{ match: "free-domain.com", status: 404 }] } = {}) {
  const fetchImpl = fakeFetch(rdapRoutes);
  const availability = createAvailabilityEngine({ fetch: fetchImpl, servers: bootstrap, limiter: null, now: NOW });
  const provider = createMockProvider({ seed: 7 });
  const payments = createPaymentGateway({ secret: "test-secret-123", now: NOW });
  const config = loadConfig();
  const service = createBackendService({ provider, availability, payments, config, now: NOW });
  const app = createApp({ service, config: { allowedOrigins: ["https://migo.example"], trustDevClaims: true } });
  return { fetchImpl, availability, provider, payments, service, app, config };
}

function api(app, method, path, { body, headers } = {}) {
  return app.handle(
    new Request("https://api.migo.example" + path, {
      method,
      headers: { "content-type": "application/json", ...(headers || {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
}

test("المسار الكامل: فحص RDAP → عرض → طلب → دفع → تسجيل", async () => {
  const { app, payments } = fullStack();
  const auth = { "x-migo-claims": JSON.stringify(USER) };

  // 1) فحص توفر عبر RDAP: 404 = متاح مؤكد (مع بقاء تأكيد المزوّد شرط للتسجيل).
  const avail = await api(app, "POST", "/availability", { body: { domain: "free-domain.com" }, headers: auth });
  const availBody = await avail.json();
  assert.equal(avail.status, 200);
  assert.equal(availBody.result.state, "AVAILABLE_CONFIRMED");
  assert.equal(availBody.result.requiresRegistrarConfirmation, true);

  // 2) عرض سعر للتجربة المحلية (allowMock) — بدون أي تكلفة.
  const quote = await api(app, "POST", "/quote", { body: { domain: "e2e-flow.com", allowMock: true } });
  assert.equal(quote.status, 200);

  // 3) طلب.
  const created = await api(app, "POST", "/order", { body: { domain: "e2e-flow.com", registrant: REGISTRANT, allowMock: true }, headers: { ...auth, "x-idempotency-key": "e2e-1" } });
  assert.equal(created.status, 201);
  const order = (await created.json()).order;
  assert.equal(order.status, "AWAITING_PAYMENT");

  // 4) نية دفع + إشعار موقّع.
  const intentRes = await api(app, "POST", "/payment/intent", { body: { orderId: order.orderId }, headers: auth });
  const intent = (await intentRes.json()).intent;
  const event = { type: "payment.succeeded", orderId: order.orderId, intentId: intent.intentId, amount: intent.amount, currency: intent.currency, occurredAt: NOW().toISOString() };
  const raw = JSON.stringify(event);
  const hook = await app.handle(new Request("https://api.migo.example/payment/webhook", { method: "POST", headers: { "content-type": "application/json", "x-migo-signature": await payments.sign(raw) }, body: raw }));
  assert.equal(hook.status, 200);
  assert.equal((await hook.json()).order.status, "PAID");

  // 5) التنفيذ الفعلي (محلي) عبر طبقة الخدمة.
  const done = await fullStackOnce("e2e-flow.com");
  assert.equal(done.status, "COMPLETED");
});

/** مسار مختصر داخل نفس النمط للتأكد من التنفيذ. */
async function fullStackOnce(domain) {
  const { service, payments } = fullStack();
  const order = await service.createOrder({ domain, registrant: REGISTRANT, allowMock: true, claims: USER });
  const intent = service.createPaymentIntent({ orderId: order.orderId, claims: USER });
  const raw = JSON.stringify({ type: "payment.succeeded", orderId: order.orderId, intentId: intent.intentId, amount: intent.amount, currency: intent.currency, occurredAt: NOW().toISOString() });
  await service.confirmPayment({ rawBody: raw, signature: await payments.sign(raw) });
  return service.fulfill({ orderId: order.orderId, allowMock: true, claims: USER });
}

test("محرك التوفر بيكاش النتيجة ومايعيدش طلب الشبكة", async () => {
  const { fetchImpl, availability } = fullStack();
  await availability.check("cache-me.com");
  await availability.check("cache-me.com");
  assert.equal(fetchImpl.calls.length, 1);
});

test("دمج المصدرين: اختلاف حاسم = MANUAL_REVIEW", () => {
  const { availability } = fullStack();
  const out = availability.combine(
    { state: "AVAILABLE_CONFIRMED", definitive: true, source: "rdap" },
    { state: "REGISTERED", definitive: true }
  );
  assert.equal(out.state, "MANUAL_REVIEW");
});

test("الإعدادات الافتراضية مابتسمحش بفتح أي ميزة حسّاسة", () => {
  const { config } = fullStack();
  assert.equal(config.features.realRegistrar, false);
  assert.equal(config.features.payments, false);
  assert.equal(config.features.advancedDns, false);
});

test("التنفيذ الحقيقي بيتحقق من التوفر لحظة التسجيل (مش من الـcache)", async () => {
  const { service, payments, provider } = fullStack();
  const order = await service.createOrder({ domain: "race-domain.com", registrant: REGISTRANT, allowMock: true, claims: USER });
  const intent = service.createPaymentIntent({ orderId: order.orderId, claims: USER });
  const raw = JSON.stringify({ type: "payment.succeeded", orderId: order.orderId, intentId: intent.intentId, amount: intent.amount, currency: intent.currency, occurredAt: NOW().toISOString() });
  await service.confirmPayment({ rawBody: raw, signature: await payments.sign(raw) });
  provider.seedDomain("race-domain.com"); // سبقنا حد تاني
  await assert.rejects(() => service.fulfill({ orderId: order.orderId, allowMock: true, claims: USER }), (e) => e.code === "DOMAIN_TAKEN");
});
