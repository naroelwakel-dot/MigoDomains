import { test } from "node:test";
import assert from "node:assert/strict";
import { createBackendService } from "../lib/service.js";
import { createPaymentGateway } from "../lib/payments.js";
import { ServiceError, SERVICE_ERROR_CODES as C } from "../lib/errors.js";
import { createMockProvider } from "../../providers/lib/mock.js";
import { CLIENT_QUOTE_KEYS } from "../../pricing/lib/quote.js";

const NOW = () => new Date("2026-11-09T10:00:00.000Z");
const USER = { sub: "user-1", role: "customer" };
const REGISTRANT = { name: "أحمد المصري", email: "ahmed@example.com", country: "EG" };

function build(opts = {}) {
  const provider = opts.provider || createMockProvider({ seed: 7 });
  const payments = createPaymentGateway({ secret: "test-secret-123", now: NOW });
  const service = createBackendService({ provider, payments, now: NOW, ...opts.service });
  return { provider, payments, service };
}

async function paidOrder(service, payments, overrides = {}) {
  const created = await service.createOrder({
    domain: "shop-migo.com",
    operation: "registration",
    years: 1,
    registrant: REGISTRANT,
    allowMock: true,
    claims: USER,
    ...overrides,
  });
  const intent = service.createPaymentIntent({ orderId: created.orderId, claims: USER });
  const event = { type: "payment.succeeded", orderId: created.orderId, intentId: intent.intentId, amount: intent.amount, currency: intent.currency, occurredAt: NOW().toISOString() };
  const raw = JSON.stringify(event);
  const signature = await payments.sign(raw);
  await service.confirmPayment({ rawBody: raw, signature });
  return { created, intent, event, raw, signature };
}

/* ------------------------------ التسعير ------------------------------- */

test("ممنوع إصدار سعر من مزوّد وهمي بدون سماح صريح", async () => {
  const { service } = build();
  const r = await service.quote({ domain: "shop.com" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "MOCK_NOT_A_REAL_PRICE");
});

test("عرض السعر مع allowMock يرجّع نسخة العميل بدون تكلفة ولا هامش", async () => {
  const { service } = build();
  const r = await service.quote({ domain: "shop.com", allowMock: true });
  assert.equal(r.ok, true);
  assert.equal(r.localTestOnly, true);
  assert.deepEqual(Object.keys(r.quote).sort(), [...CLIENT_QUOTE_KEYS].sort());
  assert.equal("wholesale" in r.quote, false);
  assert.equal("margin" in r.quote, false);
  assert.equal("cost" in r.quote, false);
});

/* ------------------------------ الطلبات ------------------------------- */

test("إنشاء طلب بدون allowMock مرفوض (مفيش سعر حقيقي من تكلفة وهمية)", async () => {
  const { service } = build();
  await assert.rejects(
    () => service.createOrder({ domain: "shop-migo.com", registrant: REGISTRANT, claims: USER }),
    (e) => e instanceof ServiceError && e.code === C.MOCK_NOT_A_REAL_PRICE
  );
});

test("الطلب يبدأ في انتظار الدفع ومبيعرضش أي تكلفة", async () => {
  const { service } = build();
  const order = await service.createOrder({ domain: "shop-migo.com", registrant: REGISTRANT, allowMock: true, claims: USER });
  assert.equal(order.status, "AWAITING_PAYMENT");
  assert.deepEqual(Object.keys(order.quote).sort(), [...CLIENT_QUOTE_KEYS].sort());
});

test("بيانات الشركة ممنوعة كمالك (الملكية للعميل)", async () => {
  const { service } = build();
  await assert.rejects(
    () => service.createOrder({ domain: "shop-migo.com", registrant: { name: "Migo AI", email: "ops@migoai.com", country: "EG" }, allowMock: true, claims: USER }),
    (e) => e.code === C.VALIDATION
  );
});

test("مفيش طلب بدون تسجيل دخول", async () => {
  const { service } = build();
  await assert.rejects(() => service.createOrder({ domain: "shop-migo.com", registrant: REGISTRANT, allowMock: true }), (e) => e.code === C.UNAUTHENTICATED);
});

/* --------------------------- Idempotency ------------------------------ */

test("نفس المفتاح ونفس الطلب = نفس الطلب", async () => {
  const { service } = build();
  const a = await service.createOrder({ domain: "shop-migo.com", registrant: REGISTRANT, allowMock: true, claims: USER, idempotencyKey: "k1" });
  const b = await service.createOrder({ domain: "shop-migo.com", registrant: REGISTRANT, allowMock: true, claims: USER, idempotencyKey: "k1" });
  assert.equal(a.orderId, b.orderId);
});

test("نفس المفتاح بطلب مختلف = IDEMPOTENCY_CONFLICT", async () => {
  const { service } = build();
  await service.createOrder({ domain: "shop-migo.com", registrant: REGISTRANT, allowMock: true, claims: USER, idempotencyKey: "k2" });
  await assert.rejects(
    () => service.createOrder({ domain: "other-migo.com", registrant: REGISTRANT, allowMock: true, claims: USER, idempotencyKey: "k2" }),
    (e) => e.code === C.IDEMPOTENCY_CONFLICT
  );
});

/* ------------------------------- الدفع -------------------------------- */

test("إشعار دفع بتوقيع غلط مرفوض", async () => {
  const { service } = build();
  await service.createOrder({ domain: "shop-migo.com", registrant: REGISTRANT, allowMock: true, claims: USER });
  await assert.rejects(() => service.confirmPayment({ rawBody: "{}", signature: "bad" }), (e) => e.code === C.PAYMENT_INVALID);
});

test("مبلغ دفع مختلف = PAYMENT_AMOUNT_MISMATCH", async () => {
  const { service, payments } = build();
  const created = await service.createOrder({ domain: "shop-migo.com", registrant: REGISTRANT, allowMock: true, claims: USER });
  const intent = service.createPaymentIntent({ orderId: created.orderId, claims: USER });
  const event = { type: "payment.succeeded", orderId: created.orderId, intentId: intent.intentId, amount: intent.amount + 1, currency: intent.currency, occurredAt: NOW().toISOString() };
  const raw = JSON.stringify(event);
  const signature = await payments.sign(raw);
  await assert.rejects(() => service.confirmPayment({ rawBody: raw, signature }), (e) => e.code === C.PAYMENT_AMOUNT_MISMATCH);
});

test("الدفع بينقل الطلب لـPAID، وتكرار الإشعار مايعملش حاجة", async () => {
  const { service, payments } = build();
  const { created, raw, signature } = await paidOrder(service, payments);
  const again = await service.confirmPayment({ rawBody: raw, signature });
  assert.equal(again.status, "PAID");
  assert.equal(again.orderId, created.orderId);
});

/* ------------------------------ التنفيذ ------------------------------- */

test("التنفيذ قبل الدفع ممنوع", async () => {
  const { service } = build();
  const order = await service.createOrder({ domain: "shop-migo.com", registrant: REGISTRANT, allowMock: true, claims: USER });
  await assert.rejects(() => service.fulfill({ orderId: order.orderId, allowMock: true, claims: USER }), (e) => e.code === C.INVALID_STATE);
});

test("الفلو الكامل: طلب → دفع → تسجيل = COMPLETED", async () => {
  const { service, payments } = build();
  const { created } = await paidOrder(service, payments);
  const done = await service.fulfill({ orderId: created.orderId, allowMock: true, claims: USER });
  assert.equal(done.status, "COMPLETED");
  assert.equal(done.domain, "shop-migo.com");
  assert.ok(done.history.some((h) => h.status === "FULFILLING"));
});

test("دومين اتسجّل من حد تاني قبل التنفيذ = DOMAIN_TAKEN", async () => {
  const provider = createMockProvider({ seed: 7 });
  const { service, payments } = build({ provider });
  const { created } = await paidOrder(service, payments, { domain: "late-"+Math.random().toString(36).slice(2,6)+".com" });
  provider.seedDomain(created.domain); // حد تاني حجزه
  await assert.rejects(() => service.fulfill({ orderId: created.orderId, allowMock: true, claims: USER }), (e) => e.code === C.DOMAIN_TAKEN);
});

/* ------------------------------ الصلاحيات ------------------------------ */

test("مستخدم تاني مايشوفش طلب غيره", async () => {
  const { service } = build();
  const order = await service.createOrder({ domain: "shop-migo.com", registrant: REGISTRANT, allowMock: true, claims: USER });
  assert.throws(() => service.getOrder(order.orderId, { sub: "user-2" }), (e) => e.code === C.FORBIDDEN);
  assert.ok(service.getOrder(order.orderId, USER));
});

/* ------------------------------- التحقق ------------------------------- */

test("search بيرجّع توفر بدون أي سعر", async () => {
  const { service } = build();
  const list = await service.search({ names: ["shop"], tlds: ["com", "net"], claims: USER });
  assert.equal(list.length, 2);
  for (const item of list) {
    assert.ok(["AVAILABLE_CONFIRMED", "REGISTERED", "PREMIUM", "RESERVED", "RESTRICTED", "UNKNOWN", "PROVIDER_ERROR", "MANUAL_REVIEW"].includes(item.state));
    assert.equal("price" in item, false);
    assert.equal("cost" in item, false);
  }
});

test("كل عملية حسّاسة مسجّلة في سجل التدقيق", async () => {
  const { service, payments } = build();
  const { created } = await paidOrder(service, payments);
  await service.fulfill({ orderId: created.orderId, allowMock: true, claims: USER });
  const actions = service.audit.all().map((e) => e.action);
  assert.ok(actions.includes("order.created"));
  assert.ok(actions.includes("order.paid"));
  assert.ok(actions.includes("order.completed"));
});

/* --------------------------- دومينات العميل --------------------------- */

test("listDomains بيرجّع الدومينات المسجّلة بس، وبدون تكلفة ولا هامش", async () => {
  const { service, payments } = build();
  const { created } = await paidOrder(service, payments);
  assert.deepEqual(service.listDomains(USER), [], "مفيش دومين قبل التنفيذ");

  await service.fulfill({ orderId: created.orderId, allowMock: true, claims: USER });
  const list = service.listDomains(USER);
  assert.equal(list.length, 1);
  const d = list[0];
  assert.equal(d.domain, "shop-migo.com");
  assert.equal(d.status, "ACTIVE");
  assert.ok(d.expiresAt, "لازم يكون فيه تاريخ انتهاء");
  assert.ok(Array.isArray(d.nameservers) && d.nameservers.length >= 2, "لازم يكون فيه سيرفرات أسماء");
  assert.equal(d.orderId, created.orderId);
  for (const bad of ["cost", "margin", "wholesale", "totalCostUsd", "marginUsd", "micros", "provenance"]) {
    assert.equal(bad in d, false, "تسريب: " + bad);
  }
});

test("listDomains مبني على الجلسة: عميل تاني مايشوفش حاجة، والمشرف بيشوف الكل", async () => {
  const { service, payments } = build();
  const { created } = await paidOrder(service, payments);
  await service.fulfill({ orderId: created.orderId, allowMock: true, claims: USER });

  assert.equal(service.listDomains({ sub: "user-2" }).length, 0);
  assert.equal(service.listDomains({ sub: "admin-1", role: "admin" }).length, 1);
  assert.throws(() => service.listDomains(), (e) => e.code === C.UNAUTHENTICATED);
});

test("listDomains مرتّب بالأقرب انتهاءً", async () => {
  const { service, payments } = build();
  const a = await paidOrder(service, payments, { domain: "aaa-migo.com" });
  const b = await paidOrder(service, payments, { domain: "bbb-migo.com" });
  await service.fulfill({ orderId: a.created.orderId, allowMock: true, claims: USER });
  await service.fulfill({ orderId: b.created.orderId, allowMock: true, claims: USER });
  const list = service.listDomains(USER);
  assert.equal(list.length, 2);
  for (let i = 1; i < list.length; i++) {
    assert.ok(String(list[i - 1].expiresAt) <= String(list[i].expiresAt), "الترتيب غلط");
  }
});

/* ------------------- معاينة التسعير للإدارة ------------------- */

import { priceFromCost, toFixedString, DEFAULT_CONFIG } from "../../pricing/lib/index.js";

const ADMIN = { sub: "admin-1", role: "admin" };

test("previewPrice بيطابق محرك التسعير المعتمد بالحرف", () => {
  const { service } = build();
  for (const cost of ["7.99", "8", "14.99", "15", "30", "30.01", "100"]) {
    const p = service.previewPrice({ costUsd: cost, claims: ADMIN });
    const engine = priceFromCost(cost);
    const fmt = (m) => toFixedString(m, DEFAULT_CONFIG.rounding.usdDecimals, DEFAULT_CONFIG.rounding.mode);
    assert.equal(p.priced, true, cost);
    assert.equal(p.saleUsd, fmt(engine.saleMicros), "سعر البيع مختلف عند " + cost);
    assert.equal(p.marginUsd, fmt(engine.marginMicros), "الهامش مختلف عند " + cost);
    assert.equal(p.tier.id, engine.marginRuleId, "الشريحة مختلفة عند " + cost);
    assert.equal(p.costUsd, fmt(engine.totalCostMicros));
  }
});

test("previewPrice للمستخدم العادي ممنوع", () => {
  const { service } = build();
  assert.throws(() => service.previewPrice({ costUsd: "12", claims: USER }), (e) => e.code === C.FORBIDDEN);
  assert.throws(() => service.previewPrice({ costUsd: "12" }), (e) => e.code === C.UNAUTHENTICATED);
});

test("previewPrice: تكلفة صفر = رفض بقرار P3 مش رقم مخترع", () => {
  const { service } = build();
  const p = service.previewPrice({ costUsd: "0", claims: ADMIN });
  assert.equal(p.priced, false);
  assert.equal(p.reason, "ZERO_COST_REQUIRES_DECISION");
  assert.equal("saleUsd" in p, false);
});

test("previewPrice: تكلفة سالبة أو نص مش رقم = VALIDATION", () => {
  const { service } = build();
  assert.throws(() => service.previewPrice({ costUsd: "-1", claims: ADMIN }), (e) => e.code === C.VALIDATION);
  assert.throws(() => service.previewPrice({ costUsd: "abc", claims: ADMIN }), (e) => e.code === C.VALIDATION);
});

test("previewPrice: EGP بيتحوّل بس لما فيه سعر صرف", () => {
  const { service } = build();
  const without = service.previewPrice({ costUsd: "30.01", claims: ADMIN });
  assert.equal(without.egp.available, false);

  const withFx = service.previewPrice({ costUsd: "30.01", fx: { rate: "50" }, claims: ADMIN });
  assert.equal(withFx.egp.available, true);
  assert.equal(withFx.egp.value, "1725.58", "50 × 34.5115");
});

test("previewPrice مسجّل في سجل التدقيق باسم المنادي", () => {
  const { service } = build();
  service.previewPrice({ costUsd: "12", claims: ADMIN });
  const entry = service.audit.list().filter((a) => a.action === "admin.price_preview").pop();
  assert.ok(entry, "مفيش سجل للمعاينة");
  assert.equal(entry.actor, "admin-1");
});
