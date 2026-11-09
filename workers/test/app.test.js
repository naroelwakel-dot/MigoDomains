import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, SECURITY_HEADERS, claimsFrom } from "../src/app.js";
import { matchRoute, ROUTES } from "../src/router.js";
import { buildApp } from "../src/index.js";
import { createBackendService, createPaymentGateway } from "../../backend/lib/index.js";
import { createMockProvider } from "../../providers/lib/mock.js";

const NOW = () => new Date("2026-11-09T10:00:00.000Z");
const USER = { sub: "user-1", role: "customer" };
const REGISTRANT = { name: "أحمد المصري", email: "ahmed@example.com", country: "EG" };

function makeApp() {
  const provider = createMockProvider({ seed: 7 });
  const payments = createPaymentGateway({ secret: "test-secret-123", now: NOW });
  const service = createBackendService({ provider, payments, now: NOW });
  return { app: createApp({ service, config: { allowedOrigins: ["https://migo.example"], trustDevClaims: true } }), provider, payments, service };
}

function req(method, path, { body, headers } = {}) {
  return new Request("https://api.migo.example" + path, {
    method,
    headers: { "content-type": "application/json", ...(headers || {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function jsonOf(res) {
  return JSON.parse(await res.text());
}

/* ------------------------------ المسارات ------------------------------ */

test("matchRoute يطابق المسارات الثابتة والمعاملات", () => {
  assert.equal(matchRoute("GET", "/health").route.id, "health");
  assert.equal(matchRoute("GET", "/order/ord_1").params.orderId, "ord_1");
  assert.equal(matchRoute("POST", "/order").route.id, "order.create");
  assert.equal(matchRoute("GET", "/nope"), null);
  assert.equal(matchRoute("POST", "/health"), null, "الطريقة لازم تطابق");
});

test("المسارات كلها ليها إعداد صلاحية صريح", () => {
  for (const r of ROUTES) assert.ok(["none", "user", "admin", "signature"].includes(r.auth), r.path);
});

/* ------------------------------- الردود ------------------------------- */

test("health بيرجّع ok", async () => {
  const { app } = makeApp();
  const res = await app.handle(req("GET", "/health"));
  assert.equal(res.status, 200);
  assert.equal((await jsonOf(res)).ok, true);
});

test("كل رد فيه هيدرز الأمان", async () => {
  const { app } = makeApp();
  const res = await app.handle(req("GET", "/health"));
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) assert.equal(res.headers.get(k), v);
});

test("مسار غير معروف = 404 بريد موحّد", async () => {
  const { app } = makeApp();
  const res = await app.handle(req("GET", "/nothing"));
  assert.equal(res.status, 404);
  assert.equal((await jsonOf(res)).error.code, "NOT_FOUND");
});

test("CORS: الأصل المسموح بياخد هيدر، وغير المسموح لأ", async () => {
  const { app } = makeApp();
  const ok = await app.handle(req("GET", "/health", { headers: { origin: "https://migo.example" } }));
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://migo.example");
  const no = await app.handle(req("GET", "/health", { headers: { origin: "https://evil.example" } }));
  assert.equal(no.headers.get("access-control-allow-origin"), null);
});

test("OPTIONS = 204 بدون جسم", async () => {
  const { app } = makeApp();
  const res = await app.handle(req("OPTIONS", "/order"));
  assert.equal(res.status, 204);
});

/* ------------------------------ الصلاحيات ------------------------------ */

test("المسار المحمي بدون دخول = 401", async () => {
  const { app } = makeApp();
  const res = await app.handle(req("GET", "/orders"));
  assert.equal(res.status, 401);
  assert.equal((await jsonOf(res)).error.code, "UNAUTHENTICATED");
});

test("المسار المحمي مع مطالبات = 200", async () => {
  const { app } = makeApp();
  const res = await app.handle(req("GET", "/orders", { headers: { "x-migo-claims": JSON.stringify(USER) } }));
  assert.equal(res.status, 200);
});

test("claimsFrom مايثقش في x-migo-claims من غير وضع التطوير", () => {
  const r = req("GET", "/orders", { headers: { "x-migo-claims": JSON.stringify(USER) } });
  assert.equal(claimsFrom(r, { trustDevClaims: false }), null);
  assert.deepEqual(claimsFrom(r, { trustDevClaims: true }), USER);
});

/* --------------------------- تكامل الفلو ---------------------------- */

test("الفلط الكامل عبر الـAPI: بحث → طلب → دفع → تسجيل", async () => {
  const { app, payments } = makeApp();
  const auth = { "x-migo-claims": JSON.stringify(USER) };

  const search = await app.handle(req("POST", "/search", { body: { names: ["shop"], tlds: ["com"] }, headers: auth }));
  assert.equal(search.status, 200);
  assert.equal((await jsonOf(search)).results.length, 1);

  const created = await app.handle(req("POST", "/order", { body: { domain: "api-test.com", registrant: REGISTRANT, allowMock: true }, headers: { ...auth, "x-idempotency-key": "api-1" } }));
  assert.equal(created.status, 201);
  const order = (await jsonOf(created)).order;
  assert.equal(order.status, "AWAITING_PAYMENT");

  const intentRes = await app.handle(req("POST", "/payment/intent", { body: { orderId: order.orderId }, headers: auth }));
  assert.equal(intentRes.status, 201);
  const intent = (await jsonOf(intentRes)).intent;

  const event = { type: "payment.succeeded", orderId: order.orderId, intentId: intent.intentId, amount: intent.amount, currency: intent.currency, occurredAt: NOW().toISOString() };
  const raw = JSON.stringify(event);
  const signature = await payments.sign(raw);
  const hook = await app.handle(new Request("https://api.migo.example/payment/webhook", { method: "POST", headers: { "content-type": "application/json", "x-migo-signature": signature }, body: raw }));
  assert.equal(hook.status, 200);
  assert.equal((await jsonOf(hook)).order.status, "PAID");

  const done = await app.handle(req("GET", "/order/" + order.orderId, { headers: auth }));
  assert.equal((await jsonOf(done)).order.status, "PAID");
});

test("GET /domains محمي، وبيرجّع مصفوفة فاضية من غير دومينات مسجّلة", async () => {
  const { app } = makeApp();

  assert.equal(matchRoute("GET", "/domains").route.auth, "user", "المسار لازم يكون محمي");

  const anon = await app.handle(req("GET", "/domains"));
  assert.equal(anon.status, 401);
  assert.equal((await jsonOf(anon)).error.code, "UNAUTHENTICATED");

  const res = await app.handle(req("GET", "/domains", { headers: { "x-migo-claims": JSON.stringify(USER) } }));
  assert.equal(res.status, 200);
  const body = await jsonOf(res);
  assert.equal(body.ok, true);
  assert.deepEqual(body.domains, []);
});

test("الـwebhook بتوقيع غلط = 400", async () => {
  const { app } = makeApp();
  const res = await app.handle(new Request("https://api.migo.example/payment/webhook", { method: "POST", body: "{}", headers: { "x-migo-signature": "bad", "content-type": "application/json" } }));
  assert.equal(res.status, 400);
  assert.equal((await jsonOf(res)).error.code, "PAYMENT_INVALID");
});

test("body مش JSON = 400 VALIDATION مش 500", async () => {
  const { app } = makeApp();
  const res = await app.handle(new Request("https://api.migo.example/quote", { method: "POST", body: "not-json", headers: { "content-type": "application/json" } }));
  assert.equal(res.status, 400);
  assert.equal((await jsonOf(res)).error.code, "VALIDATION");
});

/* --------------------------- ربط البيئة ----------------------------- */

test("buildApp من بيئة افتراضية يشتغل بالمزوّد الوهمي", async () => {
  const app = buildApp({ MIGO_ALLOWED_ORIGINS: "https://migo.example" });
  const res = await app.handle(req("GET", "/health"));
  assert.equal(res.status, 200);
});

test("طلب المزوّد الحقيقي بدون ربط = خطأ واضح", () => {
  assert.throws(() => buildApp({ MIGO_REGISTRAR: "openprovider" }), /مش مربوط/);
});

test("POST /admin/price-preview للإدارة بس", async () => {
  const { app } = makeApp();
  const route = matchRoute("POST", "/admin/price-preview");
  assert.ok(route, "المسار مش موجود");
  assert.equal(route.route.auth, "admin");

  // من غير دخول
  const anon = await app.handle(req("POST", "/admin/price-preview", { body: { costUsd: "12" } }));
  assert.equal(anon.status, 403);

  // عميل عادي
  const cust = await app.handle(req("POST", "/admin/price-preview", {
    body: { costUsd: "12" },
    headers: { "x-migo-claims": JSON.stringify(USER) },
  }));
  assert.equal(cust.status, 403);
  assert.equal((await jsonOf(cust)).error.code, "FORBIDDEN");

  // إداري
  const admin = { sub: "admin-1", role: "admin" };
  const res = await app.handle(req("POST", "/admin/price-preview", {
    body: { costUsd: "12" },
    headers: { "x-migo-claims": JSON.stringify(admin) },
  }));
  assert.equal(res.status, 200);
  const preview = (await jsonOf(res)).preview;
  assert.equal(preview.priced, true);
  assert.equal(preview.marginUsd, "3.00");
  assert.equal(preview.saleUsd, "15.00");
});

test("POST /admin/price-preview: تكلفة صفر بترجّع رفض معلَّم مش سعر", async () => {
  const { app } = makeApp();
  const admin = { sub: "admin-1", role: "admin" };
  const res = await app.handle(req("POST", "/admin/price-preview", {
    body: { costUsd: "0" },
    headers: { "x-migo-claims": JSON.stringify(admin) },
  }));
  assert.equal(res.status, 200);
  const preview = (await jsonOf(res)).preview;
  assert.equal(preview.priced, false);
  assert.equal(preview.reason, "ZERO_COST_REQUIRES_DECISION");
});

test("مسار المعاينة هو الوحيد اللي بيطلّع هامش", () => {
  const pricingLeakPaths = ROUTES.filter((r) => /price|admin/.test(r.path)).map((r) => r.path);
  assert.deepEqual(pricingLeakPaths, ["/admin/price-preview"]);
  assert.equal(ROUTES.find((r) => r.path === "/admin/price-preview").auth, "admin");
});

/* ------------------------------ سجلات DNS ------------------------------ */

/** بيسجّل دومين مملوك عبر طبقة الخدمة (مسار الدفع كامل)، عشان نختبر مسارات DNS. */
async function ownedDomain(service, payments, domain) {
  const created = await service.createOrder({ domain, registrant: REGISTRANT, allowMock: true, claims: USER });
  const intent = service.createPaymentIntent({ orderId: created.orderId, claims: USER });
  const event = { type: "payment.succeeded", orderId: created.orderId, intentId: intent.intentId, amount: intent.amount, currency: intent.currency, occurredAt: NOW().toISOString() };
  const raw = JSON.stringify(event);
  const signature = await payments.sign(raw);
  await service.confirmPayment({ rawBody: raw, signature });
  await service.fulfill({ orderId: created.orderId, allowMock: true, claims: USER });
  return { "x-migo-claims": JSON.stringify(USER) };
}

test("GET /dns/records محمي، وبيقرا سجلات الدومين المملوك", async () => {
  const { app } = makeApp();
  assert.equal(matchRoute("GET", "/dns/records").route.auth, "user");

  assert.equal((await app.handle(req("GET", "/dns/records?domain=x.com"))).status, 401);

  const auth = { "x-migo-claims": JSON.stringify(USER) };
  const res = await app.handle(req("GET", "/dns/records?domain=api-dns.com", { headers: auth }));
  assert.equal(res.status, 404, "دومين مش مسجّل عندنا");
});

test("POST /dns/records: العميل بيعدّل سجلاته، وسجلات السلطة مرفوضة 400", async () => {
  const { app, payments, service } = makeApp();
  assert.equal(matchRoute("POST", "/dns/records").route.auth, "user");

  const auth = await ownedDomain(service, payments, "api-dns2.com");

  const ok = await app.handle(req("POST", "/dns/records", { body: { domain: "api-dns2.com", records: [{ type: "A", name: "@", value: "203.0.113.5", ttl: 300 }] }, headers: auth }));
  assert.equal(ok.status, 200);
  const body = await jsonOf(ok);
  assert.equal(body.ok, true);
  assert.ok(body.records.some((r) => r.type === "A" && r.value === "203.0.113.5"));
  assert.ok(body.records.some((r) => r.type === "NS" && r.authority === true), "سجلات السلطة لازم تفضل");

  const ns = await app.handle(req("POST", "/dns/records", { body: { domain: "api-dns2.com", records: [{ type: "NS", name: "@", value: "ns9.x.test", ttl: 3600 }] }, headers: auth }));
  assert.equal(ns.status, 400);
  assert.equal((await jsonOf(ns)).error.code, "VALIDATION");
});

test("GET /dns/records: عميل تاني مش بيشوف سجلات حد", async () => {
  const { app, payments, service } = makeApp();
  await ownedDomain(service, payments, "api-dns3.com");
  const other = { "x-migo-claims": JSON.stringify({ sub: "user-2" }) };
  const res = await app.handle(req("GET", "/dns/records?domain=api-dns3.com", { headers: other }));
  assert.equal(res.status, 403);
  assert.equal((await jsonOf(res)).error.code, "FORBIDDEN");
});

test("مسارات /domain/:name محمية، والمالك بس بيقدر", async () => {
  const { app, payments, service } = makeApp();
  for (const [m, p] of [["GET", "/domain/x.com"], ["POST", "/domain/x.com/lock"], ["POST", "/domain/x.com/dnssec"], ["GET", "/domain/x.com/transfer-eligibility"]]) {
    assert.equal(matchRoute(m, p).route.auth, "user", p);
    assert.equal((await app.handle(req(m, p, { body: m === "POST" ? {} : undefined }))).status, 401, p);
  }

  const auth = await ownedDomain(service, payments, "api-sec.com");

  const details = await app.handle(req("GET", "/domain/api-sec.com", { headers: auth }));
  assert.equal(details.status, 200);
  const d = (await jsonOf(details)).details;
  assert.equal(d.domain, "api-sec.com");
  assert.equal("authCode" in d, false, "رمز النقل ممنوع يظهر هنا");

  const lock = await app.handle(req("POST", "/domain/api-sec.com/lock", { body: { locked: false }, headers: auth }));
  assert.equal(lock.status, 200);
  assert.equal((await jsonOf(lock)).locked, false);

  const dnssec = await app.handle(req("POST", "/domain/api-sec.com/dnssec", { body: { enabled: true }, headers: auth }));
  assert.equal(dnssec.status, 200);
  assert.equal((await jsonOf(dnssec)).dnssec, true);

  const elig = await app.handle(req("GET", "/domain/api-sec.com/transfer-eligibility", { headers: auth }));
  assert.equal(elig.status, 200);
  const e = await jsonOf(elig);
  assert.equal(e.ok, true);
  assert.equal(e.eligible, false, "لسه فيه DNSSEC مفتوح ولسه ما مرّوش 60 يوم");
  assert.ok(Array.isArray(e.reasons) && e.reasons.length >= 1);
});

test("GET /domain/:name: عميل تاني = 403", async () => {
  const { app, payments, service } = makeApp();
  await ownedDomain(service, payments, "api-sec2.com");
  const other = { "x-migo-claims": JSON.stringify({ sub: "user-2" }) };
  const res = await app.handle(req("GET", "/domain/api-sec2.com", { headers: other }));
  assert.equal(res.status, 403);
  assert.equal((await jsonOf(res)).error.code, "FORBIDDEN");
});
