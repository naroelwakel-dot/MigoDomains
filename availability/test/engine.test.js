import { test } from "node:test";
import assert from "node:assert/strict";
import { createAvailabilityEngine, normalizeDomain } from "../lib/engine.js";
import { parseBootstrap } from "../lib/bootstrap.js";
import { createTokenBucket } from "../lib/ratelimit.js";
import { createTtlCache } from "../lib/cache.js";
import { AVAILABILITY_STATES as S } from "../../providers/lib/states.js";

const servers = parseBootstrap({ services: [[["com"], ["https://rdap.example/v1/"]]] });

function res(status, body) {
  return { status, headers: { get: () => null }, json: async () => body };
}

test("normalizeDomain ينظّف الرابط والمسافات والحالة", () => {
  assert.equal(normalizeDomain("  HTTPS://Shop.COM/path "), "shop.com");
});

test("check يرجّع REGISTERED من RDAP", async () => {
  const engine = createAvailabilityEngine({ fetch: async () => res(200, { handle: "D1", status: ["active"] }), servers, limiter: null });
  const r = await engine.check("taken.com");
  assert.equal(r.state, S.REGISTERED);
  assert.equal(r.isDefinitive, true);
  assert.equal(r.tld, "com");
});

test("check يميّز «متاح مؤكد» ويطلب تأكيد الـRegistrar", async () => {
  const engine = createAvailabilityEngine({ fetch: async () => res(404), servers, limiter: null });
  const r = await engine.check("free.com");
  assert.equal(r.state, S.AVAILABLE_CONFIRMED);
  assert.equal(r.requiresRegistrarConfirmation, true);
});

test("النتيجة تتخزّن والمكالمة التانية cached", async () => {
  let calls = 0;
  const engine = createAvailabilityEngine({ fetch: async () => { calls++; return res(200, { handle: "D", status: [] }); }, servers, limiter: null });
  await engine.check("a.com");
  const second = await engine.check("a.com");
  assert.equal(second.cached, true);
  assert.equal(calls, 1, "طلب شبكة واحد بس");
});

test("force يتخطى الـcache", async () => {
  let calls = 0;
  const engine = createAvailabilityEngine({ fetch: async () => { calls++; return res(200, { handle: "D", status: [] }); }, servers, limiter: null });
  await engine.check("a.com");
  await engine.check("a.com", { force: true });
  assert.equal(calls, 2);
});

test("Rate limit متجاوز يرجّع PROVIDER_ERROR RATE_LIMITED", async () => {
  const limiter = createTokenBucket({ capacity: 1, refillPerSecond: 0 });
  const engine = createAvailabilityEngine({ fetch: async () => res(404), servers, limiter });
  const first = await engine.check("one.com");
  const second = await engine.check("two.com");
  assert.equal(first.state, S.AVAILABLE_CONFIRMED);
  assert.equal(second.state, S.PROVIDER_ERROR);
  assert.equal(second.reason, "RATE_LIMITED");
});

test("امتداد بدون سيرفر RDAP = UNKNOWN", async () => {
  const engine = createAvailabilityEngine({ fetch: async () => res(200, {}), servers, limiter: null });
  const r = await engine.check("x.zzz");
  assert.equal(r.state, S.UNKNOWN);
});

test("اسم بدون امتداد = DOMAIN_INVALID", async () => {
  const engine = createAvailabilityEngine({ fetch: async () => res(200, {}), servers, limiter: null });
  const r = await engine.check("nodot");
  assert.equal(r.reason, "DOMAIN_INVALID");
});

test("combine: كلمة الـRegistrar تتقدّم على RDAP", () => {
  const engine = createAvailabilityEngine({ fetch: async () => res(404), servers, limiter: null });
  const rdap = { state: S.UNKNOWN, definitive: false, source: "rdap" };
  const out = engine.combine(rdap, { state: S.REGISTERED, definitive: true });
  assert.equal(out.state, S.REGISTERED);
  assert.equal(out.authoritativeSource, "registrar");
});

test("combine: اختلاف المصدرين الحاسمين = MANUAL_REVIEW", () => {
  const engine = createAvailabilityEngine({ fetch: async () => res(404), servers, limiter: null });
  const rdap = { state: S.AVAILABLE_CONFIRMED, definitive: true, source: "rdap" };
  const out = engine.combine(rdap, { state: S.REGISTERED, definitive: true });
  assert.equal(out.state, S.MANUAL_REVIEW);
  assert.equal(out.reason, "SOURCE_CONFLICT");
  assert.deepEqual(out.conflict, { rdap: S.AVAILABLE_CONFIRMED, registrar: S.REGISTERED });
});

test("combine: Registrar غير حاسم لا يطغى", () => {
  const engine = createAvailabilityEngine({ fetch: async () => res(404), servers, limiter: null });
  const rdap = { state: S.AVAILABLE_CONFIRMED, definitive: true, source: "rdap" };
  const out = engine.combine(rdap, { state: S.UNKNOWN, definitive: false });
  assert.equal(out.state, S.AVAILABLE_CONFIRMED);
});

test("cache قابل للاستبدال من برّه", () => {
  const cache = createTtlCache({ maxEntries: 1 });
  const engine = createAvailabilityEngine({ fetch: async () => res(404), servers, limiter: null, cache });
  assert.equal(engine.cache, cache);
});
