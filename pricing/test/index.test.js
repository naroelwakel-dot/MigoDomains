import test from "node:test";
import assert from "node:assert/strict";

// اختبار الواجهة العامة: بنستورد من نقطة الدخول بس، زي أي حد هيستخدم المحرك.
import {
  issueQuote,
  toClientQuote,
  recheckQuote,
  makeCostSnapshot,
  detectCostChange,
  analyzeTiers,
  planRefresh,
  toFixedString,
  validateConfig,
  DEFAULT_CONFIG,
  pricePremiumDomain,
} from "../lib/index.js";

const NOW = new Date("2026-11-08T12:00:00.000Z");

const snapshot = (cost, agoMs = 60_000, source = "openprovider:price-list") =>
  makeCostSnapshot({
    wholesale: cost,
    source,
    retrievedAt: new Date(NOW.getTime() - agoMs),
  });

const FX = {
  rate: "50.10",
  source: "cbe:official",
  fetchedAt: new Date(NOW.getTime() - 5 * 60_000),
};

test("الواجهة العامة: الرحلة الكاملة من التكلفة للتسجيل", () => {
  // 1) تكلفة جديدة من المورّد
  const first = snapshot("7.99");
  assert.equal(planRefresh(null, { now: NOW }).action, "fetch");

  // 2) عرض سعر للعميل
  const quote = issueQuote({
    operation: "registration",
    domain: "migo-example.com",
    tld: "com",
    snapshot: first,
    fx: FX,
    now: NOW,
    id: "quote-001",
  });
  assert.equal(quote.sale.usd, "10.49");
  assert.equal(quote.egp.value, "525.55");

  // 3) نسخة العميل نظيفة
  const client = toClientQuote(quote);
  assert.equal(client.sale.usd, "10.49");
  assert.equal(JSON.stringify(client).includes("7.99"), false);

  // 4) قبل التسجيل: التكلفة اتغيّرت → نطلب عرض جديد
  const second = snapshot("9.99");
  const check = recheckQuote(quote, { snapshot: second, now: NOW });
  assert.equal(check.status, "cost_changed");
  assert.equal(check.requiresRequote, true);

  // 5) والأدمن بياخد تنبيه بالتغيّر
  const change = detectCostChange(first, second);
  assert.equal(change.changed, true);
  assert.equal(change.alerts[0].code, "COST_INCREASED");
});

test("الواجهة العامة: تصدير كل الأدوات الأساسية", () => {
  assert.equal(typeof issueQuote, "function");
  assert.equal(typeof toClientQuote, "function");
  assert.equal(typeof recheckQuote, "function");
  assert.equal(typeof makeCostSnapshot, "function");
  assert.equal(typeof detectCostChange, "function");
  assert.equal(typeof analyzeTiers, "function");
  assert.equal(typeof planRefresh, "function");
  assert.equal(typeof validateConfig, "function");
  assert.equal(typeof toFixedString, "function");
  assert.equal(typeof pricePremiumDomain, "function");
  assert.equal(typeof DEFAULT_CONFIG, "object");
});

test("الواجهة العامة: الشرائح سليمة من نقطة الدخول", () => {
  const report = analyzeTiers();
  assert.equal(report.ok, true);
});
