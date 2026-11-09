import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, assertNoSecrets, LIMITS, FEATURES } from "../index.js";

test("الإعدادات الافتراضية: كل الميزات مقفولة", () => {
  const c = loadConfig();
  assert.equal(c.env, "development");
  for (const [k, v] of Object.entries(FEATURES)) {
    assert.equal(v, false, "الميزة " + k + " لازم تبدأ مقفولة");
  }
});

test("مفيش أي سرّ في الإعدادات الافتراضية", () => {
  assert.equal(assertNoSecrets(loadConfig()), true);
});

test("يرفض بيئة غير معروفة", () => {
  assert.throws(() => loadConfig({}, { env: "prod-eu" }), /بيئة غير معروفة/);
});

test("يرفض أي حقل شبه سرّي", () => {
  assert.throws(() => assertNoSecrets({ apiKey: "x" }), /ممنوع أي سرّ/);
  assert.throws(() => assertNoSecrets({ nested: { service_role: "x" } }), /ممنوع أي سرّ/);
  assert.throws(() => loadConfig({ limits: { rateLimit: { availability: { api_key: "z" } } } }), /غير معروفة|ممنوع/);
});

test("التعديلات تُدمج مع الافتراضي بدون تغييره", () => {
  const c = loadConfig({ limits: { search: { maxNames: 5 } } });
  assert.equal(c.limits.search.maxNames, 5);
  assert.equal(c.limits.search.maxTlds, LIMITS.search.maxTlds, "الباقي زي ما هو");
});

test("يرفض مفاتيح إعدادات غير معروفة", () => {
  assert.throws(() => loadConfig({ limits: { unknownThing: { a: 1 } } }), /غير معروفة/);
});

test("الإعدادات النهائية مجمّدة (immutable)", () => {
  const c = loadConfig();
  assert.throws(() => { c.env = "production"; }, TypeError);
});
