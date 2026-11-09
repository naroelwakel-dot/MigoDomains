/* ==========================================================================
   اختبارات Openprovider Adapter
   --------------------------------------------------------------------------
   كل الاختبارات أوفلاين: بنحقن transport وهمي وبنشوف الطلبات اللي بتتولّد.
   مفيش شبكة، مفيش مفاتيح، مفيش أي عملية حقيقية.
   ========================================================================== */
import test from "node:test";
import assert from "node:assert/strict";

import {
  createOpenproviderAdapter,
  mapAvailabilityResult,
  parseDomain,
} from "../lib/openprovider.js";
import { assertProvider } from "../lib/contract.js";
import { ProviderError, PROVIDER_ERROR_CODES } from "../lib/errors.js";
import { AVAILABILITY_STATES, TRANSFER_REASON_CODES } from "../lib/states.js";

const HOST = "https://sandbox.test.openprovider.invalid/v1";

/** transport وهمي: بيسجّل الطلبات ويرجّع مغلّف Openprovider. */
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init) => {
    const method = init.method;
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body, headers: init.headers });
    for (const r of routes) {
      if (url.includes(r.match) && (!r.method || r.method === method)) {
        const data = typeof r.reply === "function" ? r.reply({ url, method, body }) : r.reply;
        if (r.status && r.status >= 400) {
          return { status: r.status, ok: false, json: async () => data };
        }
        return { status: r.status || 200, ok: true, json: async () => data };
      }
    }
    return { status: 404, ok: false, json: async () => ({ code: 404, desc: "not found", data: null }) };
  };
  fn.calls = calls;
  return fn;
}

const loginReply = { code: 0, data: { token: "T-1", reseller_id: 1 }, desc: "" };

function make(routes, opts = {}) {
  const fetch = fakeFetch([{ match: "/auth/login", method: "POST", reply: loginReply }, ...routes]);
  const adapter = createOpenproviderAdapter({
    fetch,
    baseUrl: HOST,
    environment: "sandbox",
    credentials: { username: "u", password: "p" },
    clock: () => new Date("2026-11-09T00:00:00Z"),
    ...opts,
  });
  return { adapter, fetch };
}

test("parseDomain: نص وكائن", () => {
  assert.deepEqual(parseDomain("My-Shop.COM"), { name: "my-shop.com", sld: "my-shop", tld: "com" });
  assert.deepEqual(parseDomain({ name: "x", extension: "dev" }), { name: "x.dev", sld: "x", tld: "dev" });
  assert.throws(() => parseDomain("nodot"), /دومين غير صالح/);
});

test("العقد: الأدابتر بيمرّي من assertProvider بدون دوال ناقصة", () => {
  const { adapter } = make([]);
  const r = assertProvider(adapter, { name: "openprovider" });
  assert.equal(r.ok, true);
  assert.equal(r.missingRecommended.length, 0);
  assert.equal(r.capabilities.perDomainRegistrant, true);
});

test("الحماية: ممنوع بيئة غير إنتاجية على مضيف إنتاج", () => {
  assert.throws(
    () =>
      createOpenproviderAdapter({
        fetch: fakeFetch([]),
        baseUrl: "https://api.openprovider.eu/v1",
        environment: "sandbox",
        credentials: {},
      }),
    (e) => e.code === PROVIDER_ERROR_CODES.MOCK_ONLY_NO_PRODUCTION
  );
});

test("الصدق: بيئة sandbox بدون baseUrl مؤكَّد = خطأ NOT VERIFIED (ممنوع تخمين العنوان)", () => {
  assert.throws(
    () => createOpenproviderAdapter({ fetch: fakeFetch([]), environment: "sandbox", credentials: {} }),
    (e) => e.code === PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE && /NOT VERIFIED/.test(e.message)
  );
});

test("الحماية: ممنوع اتصال من غير transport مُحقَن", () => {
  assert.throws(
    () => createOpenproviderAdapter({ baseUrl: HOST, environment: "sandbox" }),
    (e) => e.code === PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE
  );
});

test("المصادقة: تسجيل الدخول مرة واحدة وإعادة استخدام الـtoken", async () => {
  const { adapter, fetch } = make([
    { match: "/domains/check", method: "POST", reply: { code: 0, data: { results: [] } } },
  ]);
  await adapter.checkAvailability("a.com");
  await adapter.checkAvailability("b.com");
  const logins = fetch.calls.filter((c) => c.url.includes("/auth/login"));
  assert.equal(logins.length, 1, "الدخول مرة واحدة بس");
  const authed = fetch.calls.filter((c) => c.url.includes("/domains/check"));
  assert.equal(authed[0].headers.Authorization, "Bearer T-1");
});

test("التوفر: free → AVAILABLE_CONFIRMED و taken → REGISTERED و premium → PREMIUM و المجهول → UNKNOWN", async () => {
  assert.equal(mapAvailabilityResult({ status: "free" }), AVAILABILITY_STATES.AVAILABLE_CONFIRMED);
  assert.equal(mapAvailabilityResult({ status: "taken" }), AVAILABILITY_STATES.REGISTERED);
  assert.equal(mapAvailabilityResult({ status: "free", is_premium: true }), AVAILABILITY_STATES.PREMIUM);
  assert.equal(mapAvailabilityResult({ status: "weird" }), AVAILABILITY_STATES.UNKNOWN);

  const { adapter } = make([
    {
      match: "/domains/check",
      method: "POST",
      reply: { code: 0, data: { results: [{ domain: "a.com", status: "free", is_premium: false }] } },
    },
  ]);
  const res = await adapter.checkAvailability("a.com");
  assert.equal(res.state, AVAILABILITY_STATES.AVAILABLE_CONFIRMED);
  assert.equal(res.definitive, true);
});

test("التوفر: حالة مجهولة ما تبقى متاحة أبدًا (مفيش تفاؤل)", async () => {
  const { adapter } = make([
    { match: "/domains/check", method: "POST", reply: { code: 0, data: { results: [{ status: "???" }] } } },
  ]);
  const res = await adapter.checkAvailability("x.io");
  assert.equal(res.state, AVAILABILITY_STATES.UNKNOWN);
  assert.equal(res.definitive, false);
});

test("التسعير: بيترجم العملية ويقرأ سعر الجملة من /domains/prices", async () => {
  const { adapter, fetch } = make([
    {
      match: "/domains/prices",
      method: "GET",
      reply: { code: 0, data: { price: { product: { currency: "USD", price: 8.06 } } } },
    },
  ]);
  const p = await adapter.getPricing("shop.com", { operation: "registration" });
  assert.equal(p.wholesaleUsd, 8.06);
  assert.equal(p.currency, "USD");
  const call = fetch.calls.find((c) => c.url.includes("/domains/prices"));
  assert.match(call.url, /operation=create/);
});

test("التسجيل: بيبعت owner_handle (ملكية العميل) والفترة", async () => {
  const { adapter, fetch } = make([
    {
      match: "/domains",
      method: "POST",
      reply: { code: 0, data: { id: 777, status: "ACTIVE", expiration_date: "2027-11-09" } },
    },
  ]);
  const r = await adapter.registerDomain({ name: "shop.com", years: 1, registrant: { handle: "H1" } });
  assert.equal(r.providerId, 777);
  const call = fetch.calls.find((c) => c.url.endsWith("/domains"));
  assert.equal(call.body.owner_handle, "H1");
  assert.equal(call.body.period, 1);
});

test("التسجيل: من غير handle للاتصال = REGISTRANT_REQUIRED (ممنوع بيانات مباشرة)", async () => {
  const { adapter } = make([{ match: "/domains", method: "POST", reply: { code: 0, data: {} } }]);
  await assert.rejects(
    () => adapter.registerDomain({ name: "shop.com", registrant: { email: "x@y.z" } }),
    (e) => e.code === PROVIDER_ERROR_CODES.REGISTRANT_REQUIRED
  );
});

test("النقل: محتاج auth code قبل أي نداء", async () => {
  const { adapter, fetch } = make([]);
  await assert.rejects(
    () => adapter.transferDomain({ name: "shop.com", registrant: { handle: "H1" } }),
    (e) => e.code === PROVIDER_ERROR_CODES.AUTH_CODE_REQUIRED
  );
  assert.equal(fetch.calls.filter((c) => c.url.includes("/transfer")).length, 0, "مفيش نداء اتبعت");
});

test("النقل: بيبعت بيانات النقل الصح", async () => {
  const { adapter, fetch } = make([
    { match: "/domains/transfer", method: "POST", reply: { code: 0, data: { id: 99, status: "PENDING" } } },
  ]);
  const r = await adapter.transferDomain({ name: "shop.com", authCode: "EPP-1", registrant: { handle: "H1" } });
  assert.equal(r.transferId, 99);
  const call = fetch.calls.find((c) => c.url.includes("/domains/transfer"));
  assert.equal(call.body.auth_code, "EPP-1");
});

test("التفاصيل: مافيش أي رمز نقل في الرد", async () => {
  const { adapter } = make([
    {
      match: "/domains/10",
      method: "GET",
      reply: {
        code: 0,
        data: {
          id: 10,
          domain: { name: "shop", extension: "com" },
          status: "active",
          active_date: "2024-01-01",
          expiration_date: "2027-01-01",
          is_locked: true,
          is_dnssec_enabled: false,
          name_servers: [{ name: "ns1.x.com" }, { name: "ns2.x.com" }],
          auth_code: "SHOULD-NOT-SURFACE",
        },
      },
    },
  ]);
  const d = await adapter.getDomainDetails({ providerId: 10 });
  assert.equal(d.authCodeIncluded, false);
  assert.equal(d.nameservers.length, 2);
  assert.equal(JSON.stringify(d).includes("SHOULD-NOT-SURFACE"), false, "رمز النقل ما بيتسربش من التفاصيل");
});

test("رمز النقل: دالة مستقلة ووسمه حسّاس", async () => {
  const { adapter } = make([
    { match: "/domains/10/authcode", method: "GET", reply: { code: 0, data: { auth_code: "EPP-2", success: true } } },
  ]);
  const a = await adapter.getAuthCode({ providerId: 10, name: "shop.com" });
  assert.equal(a.authCode, "EPP-2");
  assert.equal(a.sensitive, true);
});

test("الأقفال: بيبعت is_locked في التحديث", async () => {
  const { adapter, fetch } = make([
    { match: "/domains/10", method: "PUT", reply: { code: 0, data: { success: true } } },
  ]);
  const r = await adapter.setLock({ providerId: 10 }, true);
  assert.equal(r.locked, true);
  const call = fetch.calls.find((c) => c.method === "PUT");
  assert.equal(call.body.is_locked, true);
});

test("الـNameservers: بيترفض أقل من 2", async () => {
  const { adapter } = make([]);
  await assert.rejects(
    () => adapter.updateNameservers({ providerId: 1, nameServers: ["ns1.x.com"] }),
    (e) => e.code === PROVIDER_ERROR_CODES.NAMESERVER_INVALID
  );
});

test("سجلات DNS: قراءة وكتابة بالمغلّف الصحيح", async () => {
  const { adapter, fetch } = make([
    {
      match: "/dns/zones/shop.com/records",
      method: "GET",
      reply: { code: 0, data: { results: [{ name: "www", type: "A", value: "1.2.3.4", ttl: 3600 }], total: 1 } },
    },
    { match: "/dns/zones/shop.com", method: "PUT", reply: { code: 0, data: { success: true } } },
  ]);
  const recs = await adapter.getDnsRecords({ zone: "shop.com" });
  assert.equal(recs[0].value, "1.2.3.4");

  await adapter.updateDnsRecords({ zone: "shop.com", add: [{ name: "api", type: "A", value: "5.6.7.8", ttl: 300 }] });
  const put = fetch.calls.find((c) => c.method === "PUT");
  assert.equal(put.body.records.add[0].name, "api");
  assert.deepEqual(put.body.records.remove, []);
});

test("الأخطاء: code مش صفر = ProviderError وبيحتفظ بالكود الأصلي", async () => {
  const { adapter } = make([
    { match: "/domains/check", method: "POST", reply: { code: 404, desc: "Domain not found", data: null } },
  ]);
  await assert.rejects(
    () => adapter.checkAvailability("gone.com"),
    (e) => e instanceof ProviderError && e.code === PROVIDER_ERROR_CODES.DOMAIN_NOT_FOUND && e.detail.code === 404
  );
});

test("الأخطاء: 429 = RATE_LIMITED", async () => {
  const { adapter } = make([
    { match: "/domains/check", method: "POST", status: 429, reply: { code: 429, desc: "too many" } },
  ]);
  await assert.rejects(
    () => adapter.checkAvailability("x.com"),
    (e) => e.code === PROVIDER_ERROR_CODES.RATE_LIMITED
  );
});

test("الأهلية: محسوبة — قفل النقل وDNSSEC بيمنعوا النقل بسبب واضح", async () => {
  const { adapter } = make([
    {
      match: "/domains/10",
      method: "GET",
      reply: {
        code: 0,
        data: {
          id: 10,
          domain: { name: "shop", extension: "com" },
          status: "active",
          creation_date: "2020-01-01",
          active_date: "2020-01-01",
          is_locked: true,
          is_dnssec_enabled: true,
        },
      },
    },
  ]);
  const elig = await adapter.checkTransferEligibility({ providerId: 10 });
  assert.equal(elig.eligible, false);
  const codes = elig.reasons.map((r) => r.code);
  assert.ok(codes.includes(TRANSFER_REASON_CODES.TRANSFER_LOCKED));
  assert.ok(codes.includes(TRANSFER_REASON_CODES.DNSSEC_ACTIVE));
});

test("الأهلية: دومين قديم مفتوح ومن غير DNSSEC = مؤهّل", async () => {
  const { adapter } = make([
    {
      match: "/domains/11",
      method: "GET",
      reply: {
        code: 0,
        data: {
          id: 11,
          domain: { name: "old", extension: "com" },
          status: "active",
          creation_date: "2019-01-01",
          active_date: "2019-01-01",
          is_locked: false,
          is_dnssec_enabled: false,
        },
      },
    },
  ]);
  const elig = await adapter.checkTransferEligibility({ providerId: 11 });
  assert.equal(elig.eligible, true);
  assert.equal(elig.reasons.length, 0);
});

test("بيانات الرد مش بتكشف أي سر أو token", async () => {
  const { adapter } = make([
    { match: "/domains/check", method: "POST", reply: { code: 0, data: { results: [{ status: "free" }] } } },
  ]);
  const res = await adapter.checkAvailability("a.com");
  const dump = JSON.stringify(res);
  assert.equal(dump.includes("T-1"), false, "الـtoken ما بيظهرش في أي رد");
});
