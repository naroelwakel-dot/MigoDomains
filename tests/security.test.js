/* ==========================================================================
   Migo Domains — اختبارات الأمان
   --------------------------------------------------------------------------
   دي بتفحص الحواجز نفسها، مش الوظائف:
     • مفيش تكلفة مورّد ولا هامش ميجو بيطلع في أي رد.
     • مفيش تسجيل من غير دفع موثوق.
     • مفيش سرّ في الإعدادات أو ملف الـWorker.
     • الصلاحيات بتتفصل على مستوى الخدمة والـAPI.
   ========================================================================== */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { createMockProvider } from "../providers/lib/mock.js";
import { createBackendService, createPaymentGateway } from "../backend/lib/index.js";
import { createApp } from "../workers/src/app.js";
import { assertNoSecrets, loadConfig, FEATURES } from "../config/index.js";
import { SERVICE_ERROR_CODES as C } from "../backend/lib/errors.js";

const NOW = () => new Date("2026-11-09T10:00:00.000Z");
const USER = { sub: "user-1", role: "customer" };
const OTHER = { sub: "user-2", role: "customer" };
const REGISTRANT = { name: "أحمد المصري", email: "ahmed@example.com", country: "EG" };

function stack() {
  const provider = createMockProvider({ seed: 7 });
  const payments = createPaymentGateway({ secret: "test-secret-123", now: NOW });
  const service = createBackendService({ provider, payments, now: NOW });
  const app = createApp({ service, config: { allowedOrigins: ["https://migo.example"], trustDevClaims: true } });
  return { provider, payments, service, app };
}

const FORBIDDEN_KEYS = /(wholesale|margin|cost|snapshot|provenance|micros|markup|fee)/i;

function walkKeys(obj, path = "", out = []) {
  if (obj === null || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    out.push(path + "." + k);
    walkKeys(v, path + "." + k, out);
  }
  return out;
}

test("مفيش تكلفة ولا هامش بيظهر في رد عرض السعر", async () => {
  const { service } = stack();
  const r = await service.quote({ domain: "safe.com", allowMock: true });
  assert.equal(r.ok, true);
  const leaked = walkKeys(r).filter((p) => FORBIDDEN_KEYS.test(p.split(".").pop()));
  assert.deepEqual(leaked, [], "تسريب مفاتيح داخلية: " + leaked.join(", "));
});

test("رد الطلب للعميل مافيهوش أي بيانات تكلفة", async () => {
  const { service } = stack();
  const order = await service.createOrder({ domain: "safe-order.com", registrant: REGISTRANT, allowMock: true, claims: USER });
  const leaked = walkKeys(order).filter((p) => FORBIDDEN_KEYS.test(p.split(".").pop()));
  assert.deepEqual(leaked, []);
});

test("إشعار الدفع بدون توقيع مرفوض (ممنوع حد يقول إنه دفع)", async () => {
  const { service } = stack();
  const order = await service.createOrder({ domain: "webhook-guard.com", registrant: REGISTRANT, allowMock: true, claims: USER });
  await assert.rejects(
    () => service.confirmPayment({ rawBody: JSON.stringify({ type: "payment.succeeded", orderId: order.orderId, amount: 1, currency: "USD" }), signature: "" }),
    (e) => e.code === C.PAYMENT_INVALID
  );
});

test("مستحيل تسجيل من غير دفع مؤكد", async () => {
  const { service } = stack();
  const order = await service.createOrder({ domain: "no-pay.com", registrant: REGISTRANT, allowMock: true, claims: USER });
  await assert.rejects(() => service.fulfill({ orderId: order.orderId, allowMock: true, claims: USER }), (e) => e.code === C.INVALID_STATE);
});

test("عميل تاني مايلمسش طلب غيره (حتى عبر الـAPI)", async () => {
  const { service, app } = stack();
  const order = await service.createOrder({ domain: "private-order.com", registrant: REGISTRANT, allowMock: true, claims: USER });
  const res = await app.handle(new Request("https://api.migo.example/order/" + order.orderId, { headers: { "x-migo-claims": JSON.stringify(OTHER) } }));
  assert.equal(res.status, 403);
});

test("مفيش وصول لمسار محمي بدون مطالبات", async () => {
  const { app } = stack();
  const res = await app.handle(new Request("https://api.migo.example/orders"));
  assert.equal(res.status, 401);
});

test("ممنوع إصدار سعر حقيقي من مزوّد وهمي", async () => {
  const { service } = stack();
  const r = await service.quote({ domain: "mock-price.com" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "MOCK_NOT_A_REAL_PRICE");
});

test("الإعدادات الافتراضية مافيهاش أي سرّ", () => {
  assert.equal(assertNoSecrets(loadConfig()), true);
  for (const [k, v] of Object.entries(FEATURES)) assert.equal(v, false, k);
});

test("ملف wrangler مايحويش أي سرّ", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const toml = readFileSync(join(here, "..", "workers", "wrangler.toml"), "utf8");
  assert.equal(/service_role/i.test(toml), false, "ممنوع ذكر Service Role");
  assert.equal(/(secret|token|api[_-]?key)\s*=\s*"[^"]+"/i.test(toml), false, "ممنوع قيمة سرّ في الملف");
});

test("كود الـWorker مابيستوردش أي حاجة سرّية من البيئة غير الأسرار المعلنة", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "..", "workers", "src", "index.js"), "utf8");
  assert.equal(/SERVICE_ROLE|service_role/i.test(src), false);
  assert.equal(/SUPABASE_SERVICE/i.test(src), false);
});

test("سياسات قاعدة البيانات مفعّلة (RLS) على الجداول الحسّاسة", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = join(here, "..", "database", "migrations");
  const sql = readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
  for (const table of ["orders", "payments", "customer_domains", "domain_registrations"]) {
    assert.ok(new RegExp("alter table public\\." + table + "\\s+enable row level security", "i").test(sql), "RLS مفعّلة على " + table);
  }
});
