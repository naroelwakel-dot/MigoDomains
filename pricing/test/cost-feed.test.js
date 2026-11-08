import test from "node:test";
import assert from "node:assert/strict";

import { toMicros, toDecimalString } from "../lib/decimal.js";
import {
  makeCostSnapshot,
  snapshotToRecord,
  checkCostFreshness,
  needsRefresh,
  changePercent,
  detectCostChange,
  planRefresh,
  COST_MAX_AGE_MS,
  COST_REASONS,
} from "../lib/cost-feed.js";

const NOW = new Date("2026-11-08T12:00:00.000Z");

function snap(wholesale, { agoMs = 60 * 1000, source = "openprovider:price-list", fees = "0" } = {}) {
  return makeCostSnapshot({
    wholesale,
    fees,
    source,
    retrievedAt: new Date(NOW.getTime() - agoMs),
  });
}

/* --------------------------------------------------------------------------
   بناء اللقطة
   -------------------------------------------------------------------------- */
test("اللقطة بتجمع المورّد + الرسوم في تكلفة كلية", () => {
  const s = makeCostSnapshot({ wholesale: "7.99", fees: "0.50", source: "x", retrievedAt: NOW });
  assert.equal(toDecimalString(s.wholesaleMicros), "7.99");
  assert.equal(toDecimalString(s.feesMicros), "0.5");
  assert.equal(toDecimalString(s.totalMicros), "8.49");
});

test("رسوم المورّد بتغيّر الشريحة فعلًا", () => {
  // 7.99 لوحدها شريحة أولى، لكن +0.50 = 8.49 → شريحة تانية
  const r = snapshotToRecord(makeCostSnapshot({ wholesale: "7.99", fees: "0.50", source: "x", retrievedAt: NOW }));
  assert.equal(r.totalUsd, "8.49");
});

test("اللقطة مجمّدة ومفيش تعديل عليها", () => {
  const s = snap("10");
  assert.throws(() => { s.totalMicros = 0n; }, TypeError);
});

test("اللقطة بترفض تكلفة سالبة أو عملة غير الدولار أو مصدر فاضي", () => {
  assert.throws(() => makeCostSnapshot({ wholesale: "-1", source: "x", retrievedAt: NOW }));
  assert.throws(() => makeCostSnapshot({ wholesale: "1", source: "x", currency: "EGP", retrievedAt: NOW }));
  assert.throws(() => makeCostSnapshot({ wholesale: "1", source: "", retrievedAt: NOW }));
  assert.throws(() => makeCostSnapshot({ wholesale: "1", source: "x", retrievedAt: "مش تاريخ" }));
});

/* --------------------------------------------------------------------------
   الطزاجة — الشرط اللي بيمنع إصدار سعر حقيقي
   -------------------------------------------------------------------------- */
test("تكلفة طازجة تتقبل", () => {
  const r = checkCostFreshness(snap("10"), { now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.ageMs, 60000);
});

test("تكلفة أقدم من 6 ساعات بترفض", () => {
  const r = checkCostFreshness(snap("10", { agoMs: COST_MAX_AGE_MS + 1 }), { now: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.reason, COST_REASONS.STALE);
});

test("تكلفة عند حد الـ6 ساعات بالظبط لسه مقبولة", () => {
  assert.equal(checkCostFreshness(snap("10", { agoMs: COST_MAX_AGE_MS }), { now: NOW }).ok, true);
});

test("كل أسباب رد التكلفة", () => {
  assert.equal(checkCostFreshness(null, { now: NOW }).reason, COST_REASONS.MISSING);
  assert.equal(checkCostFreshness({ totalMicros: 1n, source: "x", retrievedAt: NOW.toISOString(), trusted: false }, { now: NOW }).reason, COST_REASONS.UNTRUSTED);
  assert.equal(checkCostFreshness({ totalMicros: 1n, source: "", retrievedAt: NOW.toISOString() }, { now: NOW }).reason, COST_REASONS.NO_SOURCE);
  assert.equal(checkCostFreshness({ totalMicros: 1n, source: "x" }, { now: NOW }).reason, COST_REASONS.NO_TIMESTAMP);
  assert.equal(checkCostFreshness({ totalMicros: "1", source: "x", retrievedAt: NOW.toISOString() }, { now: NOW }).reason, COST_REASONS.INVALID);
  assert.equal(checkCostFreshness(snap("10", { agoMs: -60000 }), { now: NOW }).reason, COST_REASONS.FROM_FUTURE);
});

/* --------------------------------------------------------------------------
   دورة التحديث — 6 ساعات
   -------------------------------------------------------------------------- */
test("حان وقت التحديث بعد 6 ساعات", () => {
  assert.equal(needsRefresh(new Date(NOW.getTime() - 5 * 3600 * 1000), { now: NOW }), false);
  assert.equal(needsRefresh(new Date(NOW.getTime() - 6 * 3600 * 1000), { now: NOW }), true);
  assert.equal(needsRefresh(new Date(NOW.getTime() - 7 * 3600 * 1000), { now: NOW }), true);
  assert.equal(needsRefresh(null, { now: NOW }), true);
});

test("خطة التحديث: أول مرة نجلب، وبعدها بنتخطى لو لسه طازج", () => {
  assert.equal(planRefresh(null, { now: NOW }).action, "fetch");
  assert.equal(planRefresh(null, { now: NOW }).reason, "NO_BASELINE");
  assert.equal(planRefresh(snap("10"), { now: NOW }).action, "skip");
  assert.equal(planRefresh(snap("10", { agoMs: 7 * 3600 * 1000 }), { now: NOW }).action, "fetch");
});

/* --------------------------------------------------------------------------
   اكتشاف تغيّر التكلفة + التنبيهات
   -------------------------------------------------------------------------- */
test("نسبة التغيّر المئوية", () => {
  assert.equal(changePercent(toMicros("10"), toMicros("11")), "10");
  assert.equal(changePercent(toMicros("10"), toMicros("9")), "-10");
  assert.equal(changePercent(toMicros("10"), toMicros("10")), "0");
  assert.equal(changePercent(0n, toMicros("5")), null); // غير معرّفة من صفر
});

test("أول لقطة بتعمل خط أساس مش تنبيه", () => {
  const d = detectCostChange(null, snap("10"));
  assert.equal(d.first, true);
  assert.equal(d.changed, true);
  assert.equal(d.alerts[0].code, "COST_BASELINE_SET");
});

test("زيادة التكلفة بتولّد تنبيه تحذيري", () => {
  const d = detectCostChange(snap("10"), snap("12.50"));
  assert.equal(d.changed, true);
  assert.equal(d.direction, "up");
  assert.equal(d.deltaPercent, "25");
  assert.equal(d.alerts[0].code, "COST_INCREASED");
  assert.equal(d.alerts[0].severity, "warning");
  assert.match(d.alerts[0].message, /زادت/);
});

test("نقصان التكلفة بيولّد تنبيه معلوماتي", () => {
  const d = detectCostChange(snap("10"), snap("8"));
  assert.equal(d.direction, "down");
  assert.equal(d.deltaPercent, "-20");
  assert.equal(d.alerts[0].code, "COST_DECREASED");
  assert.equal(d.alerts[0].severity, "info");
});

test("التغيير في حدود الحساسية بيتعتبر مفيش تغيير", () => {
  const d = detectCostChange(snap("10"), snap("10.04"), { tolerancePercent: "0.5" });
  assert.equal(d.changed, false);
  assert.deepEqual(d.alerts, []);
});

test("تغيير المصدر لوحده بيولّد تنبيه", () => {
  const d = detectCostChange(snap("10", { source: "openprovider" }), snap("10", { source: "opensrs" }));
  assert.equal(d.changed, false);
  assert.equal(d.alerts.length, 1);
  assert.equal(d.alerts[0].code, "COST_SOURCE_CHANGED");
});

test("رسوم المورّد داخلة في المقارنة", () => {
  const d = detectCostChange(snap("10", { fees: "0" }), snap("10", { fees: "1" }));
  assert.equal(d.changed, true);
  assert.equal(d.deltaUsd, undefined);
  assert.equal(d.alerts[0].code, "COST_INCREASED");
});
