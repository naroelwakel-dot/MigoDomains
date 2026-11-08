/* اختبارات العقد الموحّد — providers/test/contract.test.js */
import test from "node:test";
import assert from "node:assert/strict";

import {
  REQUIRED_METHODS,
  RECOMMENDED_METHODS,
  SENSITIVE_METHODS,
  assertProvider,
  guardCapability,
  createMockProvider,
  CAPABILITIES,
  ProviderError,
  PROVIDER_ERROR_CODES,
} from "../lib/index.js";

const mock = () => createMockProvider({ seed: "contract" });

test("الدوال الإلزامية هي نفسها المذكورة في providers/README.md", () => {
  assert.deepEqual([...REQUIRED_METHODS].sort(), [
    "checkAvailability",
    "deleteDnsRecord",
    "getDnsRecords",
    "getDomainDetails",
    "getDomainExpiration",
    "getPricing",
    "registerDomain",
    "renewDomain",
    "transferDomain",
    "updateDnsRecords",
    "updateNameservers",
  ]);
  assert.equal(REQUIRED_METHODS.length, 11);
});

test("المزوّد الوهمي بينفّذ كل الدوال المطلوبة والموصى بها", () => {
  const p = mock();
  for (const m of [...REQUIRED_METHODS, ...RECOMMENDED_METHODS]) {
    assert.equal(typeof p[m], "function", "ناقص: " + m);
  }
  const report = assertProvider(p, { name: "mock" });
  assert.equal(report.ok, true);
  assert.deepEqual(report.missingRecommended, []);
});

test("assertProvider يفشل لو فيه دالة مطلوبة ناقصة", () => {
  const broken = mock();
  const copy = { ...broken };
  delete copy.transferDomain;
  assert.throws(
    () => assertProvider(copy, { name: "broken" }),
    (err) => err instanceof ProviderError && err.code === "PROVIDER_INCOMPLETE" && err.detail.missing.includes("transferDomain")
  );
});

test("assertProvider يفشل على كائن مش كائن", () => {
  assert.throws(() => assertProvider(null), (err) => err.code === "PROVIDER_INVALID");
});

test("assertProvider يرفض قدرة غير معروفة (منع الأخطاء المطبعية)", () => {
  const typo = { ...mock(), capabilities: () => ({ regsiter: true }) };
  assert.throws(
    () => assertProvider(typo, { name: "typo" }),
    (err) => err.code === "CAPABILITY_UNKNOWN" && err.detail.unknown.includes("regsiter")
  );
});

test("المزوّد الوهمي بيعلن بس قدرات معروفة", () => {
  const caps = mock().capabilities();
  for (const key of Object.keys(caps)) {
    assert.ok(CAPABILITIES.includes(key), "قدرة غير معروفة: " + key);
    assert.equal(typeof caps[key], "boolean");
  }
  assert.equal(caps.perDomainRegistrant, true, "الملكية لكل دومين إلزامية");
});

test("guardCapability بيمنع العملية قبل التنفيذ لو القدرة = false", () => {
  // محاكاة مزوّد زي Cloudflare: بلا تجديد عبر API.
  const noRenew = { capabilities: () => ({ renew: false, register: true }) };
  assert.throws(
    () => guardCapability(noRenew, "renew", "renewDomain"),
    (err) => err.code === PROVIDER_ERROR_CODES.CAPABILITY_NOT_SUPPORTED
  );
  assert.doesNotThrow(() => guardCapability(noRenew, "register", "registerDomain"));
  assert.doesNotThrow(() => guardCapability(mock(), "renew", "renewDomain"));
});

test("getAuthCode مصنّفة كدالة حسّاسة", () => {
  assert.ok(SENSITIVE_METHODS.includes("getAuthCode"));
});

test("كل رد من المزوّد الوهمي موسوم mock: true", () => {
  const p = mock();
  assert.equal(p.checkAvailability("a.com").mock, true);
  assert.equal(p.getPricing("a.com").mock, true);
  assert.equal(p.capabilities().mock, undefined, "القدرات مش رد وهمي — إعلان");
  assert.equal(p.meta.production, false);
});
