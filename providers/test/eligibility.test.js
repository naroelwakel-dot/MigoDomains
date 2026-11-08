/* اختبارات أهلية النقل — providers/test/eligibility.test.js */
import test from "node:test";
import assert from "node:assert/strict";

import {
  createMockProvider,
  TransferEligibilityError,
  TRANSFER_REASON_CODES,
  TRANSFER_RULES,
  DOMAIN_STATUSES,
} from "../lib/index.js";

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-06-01T00:00:00.000Z");
const daysAgo = (n) => new Date(T0.getTime() - n * DAY).toISOString();

function setup() {
  const p = createMockProvider({ seed: "elig", now: () => T0 });
  p.seedDomain("fresh.com", { registeredAt: daysAgo(59), authCode: "OK-CODE-0001" });
  p.seedDomain("ready.com", { registeredAt: daysAgo(60), years: 2, authCode: "OK-CODE-0001" });
  p.seedDomain("old.com", { registeredAt: daysAgo(400), years: 2, authCode: "OK-CODE-0001" });
  return p;
}

const codesOf = (e) => e.reasons.map((r) => r.code);

test("قاعدة الـ60 يوم: 59 يوم ممنوع، 60 يوم مسموح", () => {
  const p = setup();
  const fresh = p.checkTransferEligibility("fresh.com");
  assert.equal(fresh.eligible, false);
  assert.deepEqual(codesOf(fresh), [TRANSFER_REASON_CODES.WITHIN_60_DAYS]);
  assert.equal(fresh.daysSinceAnchor, 59);

  const ready = p.checkTransferEligibility("ready.com");
  assert.equal(ready.eligible, true);
  assert.deepEqual(ready.reasons, []);
  assert.equal(ready.daysSinceAnchor, 60);
  assert.equal(TRANSFER_RULES.LOCK_WINDOW_DAYS, 60);
});

test("الـ60 يوم بتُحسب من آخر نقل لو موجود، مش من التسجيل", () => {
  const p = setup();
  p.seedDomain("moved.com", { registeredAt: daysAgo(400), years: 2, lastTransferAt: daysAgo(10) });
  const e = p.checkTransferEligibility("moved.com");
  assert.equal(e.eligible, false);
  assert.deepEqual(codesOf(e), [TRANSFER_REASON_CODES.WITHIN_60_DAYS]);
  assert.equal(e.daysSinceAnchor, 10);
});

test("قفل النقل بيمنع، وفكه بيسمح", () => {
  const p = setup();
  p.setLock("ready.com", true);
  assert.equal(p.checkTransferEligibility("ready.com").eligible, false);
  assert.deepEqual(codesOf(p.checkTransferEligibility("ready.com")), [TRANSFER_REASON_CODES.TRANSFER_LOCKED]);
  p.setLock("ready.com", false);
  assert.equal(p.checkTransferEligibility("ready.com").eligible, true);
});

test("DNSSEC مفعّل بيمنع النقل", () => {
  const p = setup();
  p.setDnssec("ready.com", true);
  assert.deepEqual(codesOf(p.checkTransferEligibility("ready.com")), [TRANSFER_REASON_CODES.DNSSEC_ACTIVE]);
});

test("الدومين الموقوف (Hold) أو المنتهي ممنوع", () => {
  const p = setup();
  p.seedDomain("hold.com", { registeredAt: daysAgo(400), years: 2, locks: ["clientHold"] });
  assert.equal(p.checkTransferEligibility("hold.com").eligible, false);
  assert.deepEqual(codesOf(p.checkTransferEligibility("hold.com")), [TRANSFER_REASON_CODES.BAD_STATUS]);

  p.seedDomain("expired.com", { registeredAt: daysAgo(400), years: 1 });
  assert.equal(p.getDomainDetails("expired.com").status, DOMAIN_STATUSES.REDEMPTION_PERIOD);
  assert.deepEqual(codesOf(p.checkTransferEligibility("expired.com")), [TRANSFER_REASON_CODES.BAD_STATUS]);
});

test("أسباب المنع بتتجمع كلها مع بعض", () => {
  const p = setup();
  p.seedDomain("multi.com", { registeredAt: daysAgo(20), dnssec: true });
  p.setLock("multi.com", true);
  const e = p.checkTransferEligibility("multi.com");
  assert.equal(e.eligible, false);
  assert.deepEqual(
    codesOf(e).sort(),
    [TRANSFER_REASON_CODES.DNSSEC_ACTIVE, TRANSFER_REASON_CODES.TRANSFER_LOCKED, TRANSFER_REASON_CODES.WITHIN_60_DAYS].sort()
  );
});

test("الأهلية محسوبة: بعد التسجيل مباشرة بتتغيّر لوحدها من غير أي كتابة", () => {
  const p = createMockProvider({ seed: "clock", now: () => T0 });
  p.seedDomain("clock.com", { registeredAt: daysAgo(59) });
  assert.equal(p.checkTransferEligibility("clock.com").eligible, false);
  // نقدّم الساعة يوم واحد — نفس الحالة المخزّنة، نتيجة مختلفة.
  const later = createMockProvider({ seed: "clock", now: () => new Date(T0.getTime() + DAY) });
  void later;
  const e = p.checkTransferEligibility("clock.com", { asOf: new Date(T0.getTime() + DAY) });
  assert.equal(e.eligible, true);
});

test("checkTransferEligibility على دومين مش موجود = خطأ واضح", () => {
  const p = setup();
  assert.throws(() => p.checkTransferEligibility("ghost.com"), (err) => err.code === "DOMAIN_NOT_FOUND");
});

/* ------------------------------------------------------------- تنفيذ النقل */

test("النقل بيمر بثلاث بوابات: الرمز، الأهلية، والحالة", () => {
  const p = setup();

  assert.throws(
    () => p.transferDomain({ name: "ready.com" }),
    (err) => err.code === "AUTH_CODE_REQUIRED"
  );
  assert.throws(
    () => p.transferDomain({ name: "ready.com", authCode: "WRONG" }),
    (err) => err.code === "AUTH_CODE_INVALID"
  );
  assert.throws(
    () => p.transferDomain({ name: "fresh.com", authCode: "OK-CODE-0001" }),
    (err) => err instanceof TransferEligibilityError && err.code === "TRANSFER_NOT_ELIGIBLE"
  );
});

test("النقل الناجح = TRANSFER_PENDING مش مكتمل، وفيه transferId", () => {
  const p = setup();
  const r = p.transferDomain({ name: "ready.com", authCode: "OK-CODE-0001" });
  assert.equal(r.status, DOMAIN_STATUSES.TRANSFER_PENDING);
  assert.equal(typeof r.transferId, "string");
  assert.equal(r.mock, true);
  assert.equal(p.getDomainDetails("ready.com").status, DOMAIN_STATUSES.TRANSFER_PENDING);
  // ممنوع نقل تاني وهو في انتظار
  assert.throws(() => p.transferDomain({ name: "ready.com", authCode: "OK-CODE-0001" }), (err) => err.code === "TRANSFER_ALREADY_PENDING");
});

test("نفس مفتاح Idempotency على النقل = نفس طلب النقل", () => {
  const p = setup();
  const a = p.transferDomain({ name: "ready.com", authCode: "OK-CODE-0001", idempotencyKey: "t1" });
  const b = p.transferDomain({ name: "ready.com", authCode: "OK-CODE-0001", idempotencyKey: "t1" });
  assert.equal(a.transferId, b.transferId);
});

test("نتيجة النقل بتتأكد من المزوّد: نجاح بيمدّ السنة، فشل بيرجّع الحالة", () => {
  const p = setup();
  const before = p.getDomainDetails("ready.com").expiresAt;

  const a = p.transferDomain({ name: "ready.com", authCode: "OK-CODE-0001" });
  const ok = p.simulateTransferOutcome(a.transferId, "completed");
  assert.equal(ok.status, DOMAIN_STATUSES.TRANSFER_COMPLETED);
  const after = p.getDomainDetails("ready.com");
  assert.equal(after.status, DOMAIN_STATUSES.ACTIVE);
  assert.ok(new Date(after.expiresAt) > new Date(before), "النقل الناجح بيمدّ سنة");
  assert.ok(after.lastTransferAt, "تاريخ آخر نقل بيتسجّل");

  const p2 = setup();
  const b = p2.transferDomain({ name: "ready.com", authCode: "OK-CODE-0001" });
  assert.equal(p2.simulateTransferOutcome(b.transferId, "failed").status, DOMAIN_STATUSES.TRANSFER_FAILED);
  assert.equal(p2.getDomainDetails("ready.com").status, DOMAIN_STATUSES.ACTIVE, "الفشل بيسيب الدومين زي ما هو");
});

test("تأكيد نقل غير موجود أو مكرّر = خطأ واضح", () => {
  const p = setup();
  assert.throws(() => p.simulateTransferOutcome("ghost", "completed"), (err) => err.code === "DOMAIN_NOT_FOUND");
  const a = p.transferDomain({ name: "ready.com", authCode: "OK-CODE-0001" });
  p.simulateTransferOutcome(a.transferId, "completed");
  assert.throws(() => p.simulateTransferOutcome(a.transferId, "completed"), (err) => err.code === "DOMAIN_NOT_ACTIVE");
});
