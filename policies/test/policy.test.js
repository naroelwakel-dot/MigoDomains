import { test } from "node:test";
import assert from "node:assert/strict";
import { POLICY_DOCUMENTS, REQUIRED_AT_CHECKOUT, checkConsent, policyStatusWarning } from "../lib/policy.js";

test("وثائق السياسة كلها معلّمة كمسودّة لحد الاعتماد", () => {
  for (const doc of Object.values(POLICY_DOCUMENTS)) {
    assert.equal(doc.status, "DRAFT", doc.code);
    assert.match(doc.version, /draft/);
  }
});

test("الشراء محتاج موافقة على الشروط والخصوصية والاسترداد", () => {
  assert.deepEqual(REQUIRED_AT_CHECKOUT, ["terms", "privacy", "refund"]);
});

test("بدون موافقات كاملة، الشراء مرفوض ويقول الناقص", () => {
  const r = checkConsent({ terms: true });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ["privacy", "refund"]);
});

test("الموافقات الكاملة تمر", () => {
  assert.equal(checkConsent({ terms: true, privacy: true, refund: true }).ok, true);
});

test("استخدام مسودّة بيدّي تنبيه صريح", () => {
  assert.ok(policyStatusWarning({ terms: true }));
  assert.equal(policyStatusWarning({}), null);
});
