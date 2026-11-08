import test from "node:test";
import assert from "node:assert/strict";

import { toMicros, toDecimalString } from "../lib/decimal.js";
import { resolveFx, convertToEgp, FX_DEFAULT_MAX_AGE_MS, FX_REASONS } from "../lib/fx.js";

const NOW = new Date("2026-11-08T12:00:00.000Z");

function fxAgo(ms, over = {}) {
  return {
    rate: "50.10",
    source: "cbe:official",
    fetchedAt: new Date(NOW.getTime() - ms),
    ...over,
  };
}

test("سعر صرف طازج بيتقبل", () => {
  const r = resolveFx(fxAgo(60 * 1000), { now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.rate, "50.10");
  assert.equal(r.source, "cbe:official");
  assert.equal(r.ageMs, 60000);
});

test("سعر صرف أقدم من 6 ساعات بيترفض كقديم", () => {
  const r = resolveFx(fxAgo(FX_DEFAULT_MAX_AGE_MS + 1), { now: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.reason, FX_REASONS.STALE);
  assert.match(r.message, /قديم/);
});

test("سعر صرف عند حد الـ6 ساعات بالظبط لسه مقبول", () => {
  const r = resolveFx(fxAgo(FX_DEFAULT_MAX_AGE_MS), { now: NOW });
  assert.equal(r.ok, true);
});

test("الحالات المرفوضة كلها", () => {
  const cases = [
    [null, FX_REASONS.MISSING],
    [undefined, FX_REASONS.MISSING],
    [{}, FX_REASONS.MISSING],
    [{ rate: "" }, FX_REASONS.MISSING],
    [fxAgo(0, { rate: "abc" }), FX_REASONS.INVALID],
    [fxAgo(0, { rate: "0" }), FX_REASONS.INVALID],
    [fxAgo(0, { rate: "-5" }), FX_REASONS.INVALID],
    [fxAgo(0, { trusted: false }), FX_REASONS.UNTRUSTED],
    [{ rate: "50", source: "x" }, FX_REASONS.NO_TIMESTAMP],
    [fxAgo(0, { fetchedAt: "مش تاريخ" }), FX_REASONS.NO_TIMESTAMP],
    [fxAgo(-60000), FX_REASONS.FROM_FUTURE],
  ];
  for (const [input, reason] of cases) {
    const r = resolveFx(input, { now: NOW });
    assert.equal(r.ok, false, "متوقع رفض: " + JSON.stringify(input));
    assert.equal(r.reason, reason);
    assert.ok(typeof r.message === "string" && r.message.length > 0);
  }
});

test("التحويل لـ EGP بيضرب في سعر الصرف بالظبط", () => {
  const c = convertToEgp(toMicros("10.49"), fxAgo(1000), { now: NOW });
  assert.equal(c.ok, true);
  // 10.49 × 50.10 = 525.549
  assert.equal(toDecimalString(c.egpMicros), "525.549");
});

test("هامش التقلّب الافتراضي صفر (قرار P6 معلّق)", () => {
  const base = convertToEgp(toMicros("100"), fxAgo(1000), { now: NOW });
  const zero = convertToEgp(toMicros("100"), fxAgo(1000), { now: NOW, bufferPercent: "0" });
  assert.equal(toDecimalString(base.egpMicros), toDecimalString(zero.egpMicros));
});

test("هامش التقلّب بيزوّد القيمة لما يتحدّد صريحًا", () => {
  const c = convertToEgp(toMicros("100"), fxAgo(1000), { now: NOW, bufferPercent: "2.5" });
  assert.equal(c.ok, true);
  assert.equal(toDecimalString(c.egpMicros), "5135.25"); // 5010 × 1.025
});

test("التحويل بيفشل بنفس أسباب رفض السعر", () => {
  const c = convertToEgp(toMicros("10"), fxAgo(FX_DEFAULT_MAX_AGE_MS + 1), { now: NOW });
  assert.equal(c.ok, false);
  assert.equal(c.reason, FX_REASONS.STALE);
});
