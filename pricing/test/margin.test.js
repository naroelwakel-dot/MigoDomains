import test from "node:test";
import assert from "node:assert/strict";

import { toMicros, toDecimalString, toFixedString } from "../lib/decimal.js";
import { computeMargin, priceFromCost, assertClientSafe } from "../lib/margin.js";
import { DEFAULT_TIERS, pickTier, matchingTiers, analyzeTiers, MarginError } from "../lib/tiers.js";

/* --------------------------------------------------------------------------
   جدول الأمثلة الإلزامي — حرفيًا من docs/PRICING_POLICY.md
   -------------------------------------------------------------------------- */
const MANDATORY_TABLE = [
  { cost: "7.99", tier: "tier_under_8", margin: "2.50", sale: "10.49" },
  { cost: "8.00", tier: "tier_8_to_15", margin: "3.00", sale: "11.00" },
  { cost: "14.99", tier: "tier_8_to_15", margin: "3.00", sale: "17.99" },
  { cost: "15.00", tier: "tier_15_to_30", margin: "4.00", sale: "19.00" },
  { cost: "30.00", tier: "tier_15_to_30", margin: "4.00", sale: "34.00" },
  { cost: "30.01", tier: "tier_over_30", margin: "4.5015", sale: "34.5115" },
  { cost: "100.00", tier: "tier_over_30", margin: "15.00", sale: "115.00" },
];

test("جدول الأمثلة الإلزامي — مطابق بالحرف", () => {
  for (const row of MANDATORY_TABLE) {
    const priced = priceFromCost(row.cost);
    assert.equal(priced.marginRuleId, row.tier, "شريحة " + row.cost);
    // المقارنة بالقيمة الدقيقة نفسها (مش بنص العرض)، فـ2.50 و4.5015
    // الاتنين بيتقارنوا بقيمتهم الحقيقية بلا تقريب.
    assert.equal(toDecimalString(priced.marginMicros), toDecimalString(toMicros(row.margin)), "هامش " + row.cost);
    assert.equal(toDecimalString(priced.saleMicros), toDecimalString(toMicros(row.sale)), "سعر بيع " + row.cost);
  }
});

test("حدود الشرائح مملوكة بوضوح: 8 و15 و30 و30.01", () => {
  assert.equal(pickTier(toMicros("7.999999")).id, "tier_under_8");
  assert.equal(pickTier(toMicros("8")).id, "tier_8_to_15");
  assert.equal(pickTier(toMicros("14.999999")).id, "tier_8_to_15");
  assert.equal(pickTier(toMicros("15")).id, "tier_15_to_30");
  assert.equal(pickTier(toMicros("30")).id, "tier_15_to_30");
  assert.equal(pickTier(toMicros("30.000001")).id, "tier_over_30");
});

test("الشرائح بدون فجوات ولا تداخلات على مدى واسع", () => {
  const report = analyzeTiers(DEFAULT_TIERS, { from: "0", to: "150", step: "0.01" });
  assert.deepEqual(report.gaps, []);
  assert.deepEqual(report.overlaps, []);
  assert.equal(report.ok, true);
});

test("كل تكلفة بتطابق شريحة واحدة بالظبط", () => {
  for (const row of MANDATORY_TABLE) {
    assert.equal(matchingTiers(toMicros(row.cost)).length, 1, row.cost);
  }
});

test("الهامش ما ينقصش مع زيادة التكلفة (رتابة)", () => {
  let prev = -1n;
  for (let v = toMicros("0.01"); v <= toMicros("50"); v += toMicros("0.01")) {
    const m = computeMargin(v).amountMicros;
    assert.ok(m >= prev, "الهامش نقص عند " + toDecimalString(v));
    prev = m;
  }
});

test("الهامش ما يقلّش أبدًا عن الصفر", () => {
  for (const row of MANDATORY_TABLE) {
    assert.ok(computeMargin(row.cost).amountMicros > 0n, row.cost);
  }
});

/* --------------------------------------------------------------------------
   تجاوزات الامتدادات — أولوية أعلى من القاعدة العامة
   -------------------------------------------------------------------------- */
test("تجاوز الامتداد بيلغي الشريحة العامة", () => {
  const override = { id: "override_com", mode: "flat", value: "5" };
  const priced = priceFromCost("20.00", { override });
  assert.equal(priced.marginRule, "tld_override");
  assert.equal(toDecimalString(priced.marginMicros), "5");
  assert.equal(toDecimalString(priced.saleMicros), "25");
});

test("تجاوز الامتداد بالنسبة مع حد أدنى", () => {
  const override = { id: "override_io", mode: "percent", value: "20", floor: "6" };
  const big = priceFromCost("50.00", { override });
  assert.equal(toDecimalString(big.marginMicros), "10"); // 20% من 50
  const small = priceFromCost("10.00", { override });
  assert.equal(toDecimalString(small.marginMicros), "6"); // الحد الأدنى
  assert.equal(small.marginDetail.floored, true);
});

/* --------------------------------------------------------------------------
   التكلفة الصفرية — قرار P3 معلّق
   -------------------------------------------------------------------------- */
test("التكلفة الصفرية بتترفض بدون قرار صريح (P3)", () => {
  assert.throws(() => computeMargin("0"), (err) => {
    assert.ok(err instanceof MarginError);
    assert.equal(err.code, "ZERO_COST_REQUIRES_DECISION");
    return true;
  });
});

test("التكلفة الصفرية بتشتغل لو الأدمن فعّل الخيار", () => {
  const m = computeMargin("0", { zeroCost: { allow: true } });
  assert.equal(toFixedString(m.amountMicros, 2), "2.50");
});

/* --------------------------------------------------------------------------
   التحقق من عدم تسريب التكلفة والهامش
   -------------------------------------------------------------------------- */
test("assertClientSafe بيمنع أي مفتاح تكلفة أو هامش", () => {
  const clean = { quoteId: "q1", sale: { usd: "10.49" } };
  assert.doesNotThrow(() => assertClientSafe(clean));

  for (const key of ["cost", "margin", "totalCostUsd", "wholesale", "providerFees", "marginUsd"]) {
    assert.throws(() => assertClientSafe({ [key]: 1 }), (err) => {
      assert.equal(err.code, "CLIENT_LEAK");
      return true;
    }, "المفتاح المسرّب: " + key);
  }

  // وبرضه لو مدفون جوه كائن متداخل
  assert.throws(() => assertClientSafe({ a: { b: { cost: 1 } } }), (err) => err.code === "CLIENT_LEAK");
});

test("assertClientSafe بيعدّي المفاتيح المسموحة", () => {
  const client = {
    quoteId: "q",
    issuedAt: "2026-11-08T00:00:00.000Z",
    lockedUntil: "2026-11-08T00:15:00.000Z",
    operation: "registration",
    domain: "example.com",
    tld: "com",
    sale: { currency: "USD", usd: "10.49", usdExact: "10.49", decimals: 2, roundingMode: "half-up" },
    egp: { currency: "EGP", available: false, value: null },
    tierRuleVersion: "1.0",
  };
  assert.doesNotThrow(() => assertClientSafe(client));
});
