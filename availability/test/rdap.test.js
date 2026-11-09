import { test } from "node:test";
import assert from "node:assert/strict";
import { rdapLookup, RDAP_REASONS } from "../lib/rdap.js";
import { AVAILABILITY_STATES as S } from "../../providers/lib/states.js";

const SERVER = "https://rdap.example/v1/";

function res(status, body, headers = {}) {
  return {
    status,
    headers: { get: (k) => headers[k.toLowerCase()] || null },
    json: async () => {
      if (body === undefined) throw new Error("no json");
      return body;
    },
  };
}

const now = () => new Date("2026-11-09T10:00:00.000Z");

test("200 مع سجل = REGISTERED حاسم", async () => {
  const r = await rdapLookup("taken.com", { fetch: async () => res(200, { handle: "D1", ldhName: "TAKEN.COM", status: ["active"] }), serverUrl: SERVER, now });
  assert.equal(r.state, S.REGISTERED);
  assert.equal(r.definitive, true);
  assert.equal(r.detail.handle, "D1");
  assert.equal(r.checkedAt, "2026-11-09T10:00:00.000Z");
});

test("404 = AVAILABLE_CONFIRMED حاسم (مش UNKNOWN)", async () => {
  const r = await rdapLookup("free.com", { fetch: async () => res(404), serverUrl: SERVER, now });
  assert.equal(r.state, S.AVAILABLE_CONFIRMED);
  assert.equal(r.definitive, true);
  assert.equal(r.reason, RDAP_REASONS.NOT_FOUND);
});

test("انقطاع الشبكة = UNKNOWN غير حاسم (ممنوع نفترض متاح)", async () => {
  const r = await rdapLookup("x.com", { fetch: async () => { throw new Error("boom"); }, serverUrl: SERVER, now });
  assert.equal(r.state, S.UNKNOWN);
  assert.equal(r.definitive, false);
  assert.equal(r.reason, RDAP_REASONS.NETWORK_ERROR);
});

test("429 = PROVIDER_ERROR RATE_LIMITED", async () => {
  const r = await rdapLookup("x.com", { fetch: async () => res(429), serverUrl: SERVER, now });
  assert.equal(r.state, S.PROVIDER_ERROR);
  assert.equal(r.reason, RDAP_REASONS.RATE_LIMITED);
});

test("5xx = PROVIDER_ERROR، و403 = MANUAL_REVIEW", async () => {
  const a = await rdapLookup("x.com", { fetch: async () => res(503), serverUrl: SERVER, now });
  assert.equal(a.state, S.PROVIDER_ERROR);
  const b = await rdapLookup("x.com", { fetch: async () => res(403), serverUrl: SERVER, now });
  assert.equal(b.state, S.MANUAL_REVIEW);
});

test("3xx = MANUAL_REVIEW مع بيان المكان", async () => {
  const r = await rdapLookup("x.com", { fetch: async () => res(301, undefined, { location: "https://other.example/" }), serverUrl: SERVER, now });
  assert.equal(r.state, S.MANUAL_REVIEW);
  assert.equal(r.detail.location, "https://other.example/");
});

test("200 برد مش JSON صالح = UNKNOWN BAD_RESPONSE", async () => {
  const r = await rdapLookup("x.com", { fetch: async () => res(200, undefined), serverUrl: SERVER, now });
  assert.equal(r.state, S.UNKNOWN);
  assert.equal(r.reason, RDAP_REASONS.BAD_RESPONSE);
});

test("status محجوز = RESERVED، وhold = RESTRICTED", async () => {
  const a = await rdapLookup("x.com", { fetch: async () => res(200, { status: ["reserved"] }), serverUrl: SERVER, now });
  assert.equal(a.state, S.RESERVED);
  const b = await rdapLookup("x.com", { fetch: async () => res(200, { status: ["client hold"] }), serverUrl: SERVER, now });
  assert.equal(b.state, S.RESTRICTED);
});

test("بدون سيرفر للامتداد = UNKNOWN غير حاسم", async () => {
  const r = await rdapLookup("x.unknown", { fetch: async () => res(200, {}), serverUrl: null, now });
  assert.equal(r.state, S.UNKNOWN);
  assert.equal(r.reason, RDAP_REASONS.NO_SERVER_FOR_TLD);
});
