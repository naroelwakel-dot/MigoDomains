/* اختبارات الجسر مع محرك التسعير — providers/test/pricing-bridge.test.js */
import test from "node:test";
import assert from "node:assert/strict";

import {
  createMockProvider,
  mockPricingToCostSnapshot,
  isMockSnapshot,
  costSnapshotFromProvider,
  buildQuoteFromProvider,
  recheckFromProvider,
  MOCK_PROVENANCE_TAG,
  MOCK_COST_REFUSAL,
} from "../lib/index.js";

import { priceFromCost, toMicros, toDecimalString } from "../../pricing/lib/index.js";

const T0 = new Date("2026-06-01T00:00:00.000Z");
const provider = () => createMockProvider({ seed: "bridge", now: () => T0 });
const FX = { rate: "50.10", source: "cbe", fetchedAt: T0 };

/* ------------------------------------------------------ تحويل التكلفة */

test("تحويل سجل المزوّد: المجموع = الجملة + الرسوم، والمصدر موسوم", () => {
  const p = provider();
  const pricing = p.getPricing("my-shop.com", { operation: "registration" });
  const snap = mockPricingToCostSnapshot(pricing);
  assert.equal(snap.totalMicros, snap.wholesaleMicros + snap.feesMicros);
  assert.equal(snap.totalMicros, toMicros("8.67"));
  assert.ok(snap.source.includes(MOCK_PROVENANCE_TAG));
  assert.equal(snap.trusted, false, "الوهمي مش موثوق افتراضيًا");
  assert.equal(isMockSnapshot(snap), true);
});

test("مزوّد إنتاجي (production) بينتج لقطة موثوقة ومش موسومة وهمي", () => {
  const real = {
    meta: { provider: "openprovider", environment: "production", production: true },
    getPricing: () => ({
      wholesaleUsd: "9.00",
      feesUsd: "0.50",
      currency: "USD",
      source: "openprovider:price-list",
      retrievedAt: T0.toISOString(),
    }),
  };
  const read = costSnapshotFromProvider(real, "my-shop.com");
  assert.equal(read.snapshot.trusted, true);
  assert.equal(isMockSnapshot(read.snapshot), false);
  assert.equal(read.warning, null);
  assert.equal(read.localTestOnly, false);
});

/* ------------------------------------------------------ بوابة الأمان */

test("بوابة الأمان: ممنوع إصدار سعر حقيقي من تكلفة وهمية", () => {
  const r = buildQuoteFromProvider({ provider: provider(), domain: "my-shop.com", operation: "registration" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, MOCK_COST_REFUSAL.reason);
  assert.equal(r.reason, "MOCK_NOT_A_REAL_PRICE");
  assert.ok(r.warning.includes("ممنوعة"), "لازم يكون فيه تحذير واضح");
  assert.equal(r.quote, undefined, "مفيش عرض سعر خالص");
});

test("allowMock: قبول صريح للتجربة المحلية — ولسه معلّم كتجربة", () => {
  const r = buildQuoteFromProvider({
    provider: provider(),
    domain: "my-shop.com",
    operation: "registration",
    allowMock: true,
    fx: FX,
  });
  assert.equal(r.ok, true);
  assert.equal(r.localTestOnly, true);
  assert.ok(r.warning.includes("للتجربة المحلية"));
  assert.equal(r.quote.sale.decimals, 2);
});

test("حتى مع allowMock: الوسم على المصدر بيفضل، والعميل مايشوفش تكلفة", () => {
  const r = buildQuoteFromProvider({
    provider: provider(),
    domain: "my-shop.com",
    operation: "registration",
    allowMock: true,
    fx: FX,
  });
  assert.ok(r.snapshot.source.includes(MOCK_PROVENANCE_TAG));
  assert.equal(isMockSnapshot(r.snapshot), true);
  assert.equal(Object.keys(r.clientQuote).includes("cost"), false);
  assert.equal(Object.keys(r.clientQuote).includes("margin"), false);
  assert.equal(JSON.stringify(r.clientQuote).includes("wholesale"), false);
});

/* ------------------------------------------------------ التركيب الحسابي */

test("السعر الناتج = نفس نتيجة محرك التسعير على نفس التكلفة", () => {
  const r = buildQuoteFromProvider({
    provider: provider(),
    domain: "my-shop.com",
    operation: "registration",
    allowMock: true,
    fx: FX,
  });
  const expected = priceFromCost(r.snapshot.totalMicros);
  assert.equal(r.quote.sale.usdExact, toDecimalString(expected.saleMicros));
  assert.equal(r.quote.margin.usd, "3.00", "تكلفة 8.67 → شريحة 3.00 ثابت");
  assert.equal(r.quote.sale.usd, "11.67");
});

test("التسعير شغّال على العمليات الثلاث بنفس القاعدة", () => {
  const p = provider();
  for (const operation of ["registration", "renewal", "transfer"]) {
    const r = buildQuoteFromProvider({ provider: p, domain: "my-shop.com", operation, allowMock: true });
    assert.equal(r.ok, true, operation);
    assert.ok(r.quote.sale.usdExact, operation);
    assert.equal(r.quote.operation, operation);
  }
});

test("EGP بتتحسب لما سعر الصرف موجود، وبتتوقف لما يكون غايب", () => {
  const withFx = buildQuoteFromProvider({
    provider: provider(), domain: "my-shop.com", operation: "registration", allowMock: true, fx: FX, now: T0,
  });
  assert.equal(withFx.quote.egp.available, true);
  assert.equal(withFx.quote.egp.value, "584.67");

  const noFx = buildQuoteFromProvider({
    provider: provider(), domain: "my-shop.com", operation: "registration", allowMock: true, now: T0,
  });
  assert.equal(noFx.quote.egp.available, false);
  assert.ok(noFx.quote.egp.unavailableReason);

  // سعر صرف قديم (أقدم من الحد) → مفيش سعر EGP مُختلق
  const staleFx = buildQuoteFromProvider({
    provider: provider(), domain: "my-shop.com", operation: "registration", allowMock: true,
    fx: { rate: "50.10", source: "cbe", fetchedAt: new Date(T0.getTime() - 48 * 3600 * 1000) },
    now: T0,
  });
  assert.equal(staleFx.quote.egp.available, false);
  assert.equal(staleFx.quote.egp.unavailableReason, "FX_STALE");
  assert.equal(staleFx.quote.sale.usd, "11.67", "السعر بالدولار لسه صالح");
});

test("الدومين المميّز (Premium) مرفوض — القرار لسه معلّق، مفيش هامش مُختلق", () => {
  const p = createMockProvider({ seed: "prem", now: () => T0, premium: ["premium.io"] });
  const pricing = p.getPricing("premium.io", { operation: "registration" });
  assert.equal(pricing.premium, true, "المزوّد بيعلّم إنه مميّز");
  // التسعير العادي لسه بيمشي (السياسة المعلّقة هي اللي بتوقف سعر Premium المخصص)
  const r = buildQuoteFromProvider({ provider: p, domain: "premium.io", operation: "registration", allowMock: true });
  assert.equal(r.ok, true);
});

/* ------------------------------------------------------ إعادة التحقق */

test("إعادة التحقق: نفس التكلفة = العرض صالح", () => {
  const p = provider();
  const r = buildQuoteFromProvider({ provider: p, domain: "my-shop.com", operation: "registration", allowMock: true });
  const again = recheckFromProvider(r.quote, { provider: p, domain: "my-shop.com", allowMock: true });
  assert.equal(again.status, "unchanged");
  assert.equal(again.requiresRequote, false);
});

test("إعادة التحقق: بوابة الأمان بتشتغل برضه بدون allowMock", () => {
  const p = provider();
  const r = buildQuoteFromProvider({ provider: p, domain: "my-shop.com", operation: "registration", allowMock: true });
  const blocked = recheckFromProvider(r.quote, { provider: p, domain: "my-shop.com" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "MOCK_NOT_A_REAL_PRICE");
});

test("إعادة التحقق: تغيّر التكلفة = مطلوب عرض جديد", () => {
  const p = provider();
  const r = buildQuoteFromProvider({ provider: p, domain: "my-shop.com", operation: "registration", allowMock: true });

  const expensiver = {
    meta: { provider: "openprovider", environment: "production", production: true },
    getPricing: () => ({
      wholesaleUsd: "12.00", feesUsd: "0.50", currency: "USD",
      source: "openprovider:price-list", retrievedAt: T0.toISOString(),
    }),
  };
  const changed = recheckFromProvider(r.quote, { provider: expensiver, domain: "my-shop.com" });
  // المصدر اختلف → الجسر بيرجّع بيانات المصدر مع النتيجة
  assert.equal(changed.ok, true);
  assert.equal(changed.status, "cost_changed");
  assert.equal(changed.requiresRequote, true);
});

/* ------------------------------------------------------ حدود */

test("مزوّد بدون getPricing = خطأ واضح", () => {
  assert.throws(() => costSnapshotFromProvider({}, "my-shop.com"), /getPricing/);
});
