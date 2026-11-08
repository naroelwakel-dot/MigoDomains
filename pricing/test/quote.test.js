import test from "node:test";
import assert from "node:assert/strict";

import {
  issueQuote,
  toClientQuote,
  isQuoteLocked,
  recheckQuote,
  pricePremiumDomain,
  QuoteError,
  CLIENT_QUOTE_KEYS,
} from "../lib/quote.js";
import { makeCostSnapshot } from "../lib/cost-feed.js";
import { DEFAULT_CONFIG, mergeConfig, validateConfig } from "../lib/config.js";

const NOW = new Date("2026-11-08T12:00:00.000Z");

function config(over = {}) {
  const c = mergeConfig(over);
  validateConfig(c);
  return c;
}

function snapshot(cost, { agoMs = 60 * 1000, source = "openprovider:price-list", fees = "0" } = {}) {
  return makeCostSnapshot({
    wholesale: cost,
    fees,
    source,
    retrievedAt: new Date(NOW.getTime() - agoMs),
  });
}

const FX = { rate: "50.10", source: "cbe:official", fetchedAt: new Date(NOW.getTime() - 60 * 1000) };

/* --------------------------------------------------------------------------
   الإصدار العادي
   -------------------------------------------------------------------------- */
test("عرض سعر كامل: تكلفة + هامش + سعر بيع + EGP", () => {
  const q = issueQuote({
    operation: "registration",
    domain: "example.com",
    tld: "com",
    snapshot: snapshot("7.99"),
    fx: FX,
    now: NOW,
    id: "q-1",
  });

  assert.equal(q.quoteId, "q-1");
  assert.equal(q.status, "issued");
  assert.equal(q.issuedAt, NOW.toISOString());
  assert.equal(q.lockedUntil, new Date(NOW.getTime() + DEFAULT_CONFIG.quote.lockMs).toISOString());

  assert.equal(q.cost.totalUsd, "7.99");
  assert.equal(q.margin.usd, "2.50");
  assert.equal(q.sale.usd, "10.49");
  assert.equal(q.sale.usdExact, "10.49");

  assert.equal(q.egp.available, true);
  assert.equal(q.egp.value, "525.55"); // 10.49 × 50.10
  assert.equal(q.fx.rate, "50.10");
});

test("مدة القفل 15 دقيقة", () => {
  const q = issueQuote({ operation: "registration", snapshot: snapshot("20"), now: NOW, id: "q" });
  assert.equal(new Date(q.lockedUntil) - new Date(q.issuedAt), 15 * 60 * 1000);
});

test("كل عملية بتتسعّر من تكلفتها المستقلة", () => {
  const reg = issueQuote({ operation: "registration", snapshot: snapshot("10"), now: NOW, id: "a" });
  const ren = issueQuote({ operation: "renewal", snapshot: snapshot("30"), now: NOW, id: "b" });
  const tr = issueQuote({ operation: "transfer", snapshot: snapshot("40"), now: NOW, id: "c" });

  assert.equal(reg.sale.usdExact, "13");
  assert.equal(ren.sale.usdExact, "34");
  assert.equal(tr.sale.usdExact, "46"); // 40 + 15% = 46

  // النقل بياخد **نفس** الشرائح العامة (قرار P1) — مفيش سياسة منفصلة
  assert.equal(tr.margin.rule, "tier");
  assert.equal(tr.margin.ruleId, "tier_over_30");
});

test("التقريب النهائي من الإعدادات مش مثبّت في الكود", () => {
  const q2 = issueQuote({
    operation: "registration",
    snapshot: snapshot("30.01"),
    now: NOW,
    id: "q2",
    config: config({ rounding: { usdDecimals: 2 } }),
  });
  assert.equal(q2.sale.usdExact, "34.5115"); // القيمة الحقيقية محفوظة
  assert.equal(q2.sale.usd, "34.51");        // والعرض مقرَّب

  const q4 = issueQuote({
    operation: "registration",
    snapshot: snapshot("30.01"),
    now: NOW,
    id: "q4",
    config: config({ rounding: { usdDecimals: 4 } }),
  });
  assert.equal(q4.sale.usd, "34.5115");
});

test("تجاوز الامتداد بيسري على العرض", () => {
  const q = issueQuote({
    operation: "registration",
    tld: "com",
    snapshot: snapshot("10"),
    now: NOW,
    id: "q",
    config: config({ tldOverrides: { com: { mode: "flat", value: "6.00" } } }),
  });
  assert.equal(q.margin.rule, "tld_override");
  assert.equal(q.sale.usdExact, "16");
});

/* --------------------------------------------------------------------------
   الممنوعات
   -------------------------------------------------------------------------- */
test("ممنوع إصدار سعر بدون تكلفة", () => {
  assert.throws(
    () => issueQuote({ operation: "registration", snapshot: null, now: NOW }),
    (err) => err instanceof QuoteError && err.code === "COST_MISSING"
  );
});

test("ممنوع إصدار سعر على تكلفة قديمة", () => {
  assert.throws(
    () => issueQuote({ operation: "registration", snapshot: snapshot("10", { agoMs: 7 * 3600 * 1000 }), now: NOW }),
    (err) => err instanceof QuoteError && err.code === "COST_STALE"
  );
});

test("عملية مش مدعومة بترفض", () => {
  assert.throws(
    () => issueQuote({ operation: "premium_register", snapshot: snapshot("10"), now: NOW }),
    (err) => err.code === "OPERATION_UNSUPPORTED"
  );
});

test("تكلفة صفرية من غير قرار بترفض", () => {
  assert.throws(
    () => issueQuote({ operation: "registration", snapshot: snapshot("0"), now: NOW }),
    (err) => err.code === "ZERO_COST_REQUIRES_DECISION"
  );
});

/* --------------------------------------------------------------------------
   FX: العروض ما تتوقفش، بس EGP بيتشال
   -------------------------------------------------------------------------- */
test("USD بيفضل شغال لو سعر الصرف قديم، وEGP بيتوقف بسبب واضح", () => {
  const q = issueQuote({
    operation: "registration",
    snapshot: snapshot("7.99"),
    now: NOW,
    id: "q",
    fx: { rate: "50.10", source: "cbe", fetchedAt: new Date(NOW.getTime() - 8 * 3600 * 1000) },
  });
  assert.equal(q.sale.usd, "10.49");
  assert.equal(q.egp.available, false);
  assert.equal(q.egp.unavailableReason, "FX_STALE");
  assert.equal(q.egp.value, null);
  assert.equal(q.fx, null);
});

test("مفيش سعر صرف خالص → EGP موقوف ومفيش سعر مختلق", () => {
  const q = issueQuote({ operation: "registration", snapshot: snapshot("7.99"), now: NOW, id: "q" });
  assert.equal(q.egp.available, false);
  assert.equal(q.egp.unavailableReason, "FX_MISSING");
});

test("EGP بيتوقف لو الإعدادات قافلاه", () => {
  const q = issueQuote({
    operation: "registration",
    snapshot: snapshot("7.99"),
    fx: FX,
    now: NOW,
    id: "q",
    config: config({ quote: { includeEgp: false } }),
  });
  assert.equal(q.egp.available, false);
  assert.equal(q.egp.unavailableReason, "FX_DISABLED");
});

/* --------------------------------------------------------------------------
   نسخة العميل — بدون تكلفة ولا هامش
   -------------------------------------------------------------------------- */
test("نسخة العميل مفيهاش تكلفة ولا هامش ولا مفاتيح داخلية", () => {
  const q = issueQuote({
    operation: "registration",
    domain: "example.com",
    tld: "com",
    snapshot: snapshot("7.99"),
    fx: FX,
    now: NOW,
    id: "q",
  });
  const client = toClientQuote(q);

  assert.deepEqual(Object.keys(client).sort(), [...CLIENT_QUOTE_KEYS].sort());
  const json = JSON.stringify(client);
  for (const banned of ["7.99", "2.50", "wholesale", "margin", "cost", "openprovider"]) {
    assert.equal(json.includes(banned), false, "اتسرّب: " + banned);
  }
  assert.equal(client.sale.usd, "10.49");
  assert.equal(client.egp.value, "525.55");
});

/* --------------------------------------------------------------------------
   إعادة التحقق قبل التسجيل
   -------------------------------------------------------------------------- */
test("العرض الصالح بيفضل صالح لو التكلفة ما اتغيّرتش", () => {
  const q = issueQuote({ operation: "registration", snapshot: snapshot("7.99"), now: NOW, id: "q" });
  const r = recheckQuote(q, { snapshot: snapshot("7.99"), now: NOW });
  assert.equal(r.status, "unchanged");
  assert.equal(r.requiresRequote, false);
});

test("تغيّر التكلفة بيطلب عرض جديد", () => {
  const q = issueQuote({ operation: "registration", snapshot: snapshot("7.99"), now: NOW, id: "q" });
  const r = recheckQuote(q, { snapshot: snapshot("9.99"), now: NOW });
  assert.equal(r.status, "cost_changed");
  assert.equal(r.requiresRequote, true);
  assert.equal(r.previousSaleUsdExact, "10.49");
  assert.equal(r.currentSaleUsdExact, "12.99"); // 9.99 + 3.00
});

test("العرض المنتهي بيتطلب إعادة إصدار", () => {
  const q = issueQuote({ operation: "registration", snapshot: snapshot("7.99"), now: NOW, id: "q" });
  const later = new Date(NOW.getTime() + 16 * 60 * 1000);
  const r = recheckQuote(q, { snapshot: snapshot("7.99", { agoMs: 60 * 1000 }), now: later });
  assert.equal(r.status, "expired");
  assert.equal(r.requiresRequote, true);
  assert.equal(r.reason, "QUOTE_EXPIRED");
});

test("تكلفة قديمة وقت إعادة التحقق بتمنع المتابعة", () => {
  const q = issueQuote({ operation: "registration", snapshot: snapshot("7.99"), now: NOW, id: "q" });
  const r = recheckQuote(q, { snapshot: snapshot("7.99", { agoMs: 9 * 3600 * 1000 }), now: NOW });
  assert.equal(r.status, "cost_unavailable");
  assert.equal(r.requiresRequote, true);
  assert.equal(r.reason, "COST_STALE");
});

test("isQuoteLocked بيتصرّف صح", () => {
  const q = issueQuote({ operation: "registration", snapshot: snapshot("7.99"), now: NOW, id: "q" });
  assert.equal(isQuoteLocked(q, NOW), true);
  assert.equal(isQuoteLocked(q, new Date(NOW.getTime() + 14 * 60 * 1000)), true);
  assert.equal(isQuoteLocked(q, new Date(NOW.getTime() + 15 * 60 * 1000 + 1)), false);
});

/* --------------------------------------------------------------------------
   Premium — قرار معلّق، فالسلوك المقصود رفض
   -------------------------------------------------------------------------- */
test("تسعير Premium بترفض لحد قرار P5", () => {
  assert.throws(
    () => pricePremiumDomain({}),
    (err) => err instanceof QuoteError && err.code === "PREMIUM_PRICING_NOT_CONFIGURED"
  );
});

/* --------------------------------------------------------------------------
   الإعدادات
   -------------------------------------------------------------------------- */
test("الإعدادات الافتراضية سليمة", () => {
  assert.doesNotThrow(() => validateConfig(DEFAULT_CONFIG));
});

test("دمج الإعدادات بيمشي مع الأقسام من غير ما يمسح الباقي", () => {
  const c = mergeConfig({ rounding: { usdDecimals: 3 } });
  assert.equal(c.rounding.usdDecimals, 3);
  assert.equal(c.rounding.egpDecimals, 2);
  assert.equal(c.rounding.mode, "half-up");
  assert.equal(c.quote.lockMs, DEFAULT_CONFIG.quote.lockMs);
});

test("إعدادات غلط بترفض", () => {
  assert.throws(() => validateConfig(mergeConfig({ rounding: { usdDecimals: 9 } })), (e) => e.code === "CONFIG_INVALID");
  assert.throws(() => validateConfig(mergeConfig({ quote: { lockMs: 0 } })), (e) => e.code === "CONFIG_INVALID");
  assert.throws(() => validateConfig(mergeConfig({ tiers: [] })), (e) => e.code === "CONFIG_INVALID");
});
