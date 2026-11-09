/* ==========================================================================
   اختبارات صفحة حسابي (account.html)
   ========================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, load, jsonResponse, settle, src, page, codeOnly } from "./dom-harness.js";

const API = { baseUrl: "https://api.example.com" };
const SESSION = { access_token: "tok_1" };

const ORDERS = [
  { orderId: "ORD-1", domain: "migo-egypt.com", operation: "registration", status: "COMPLETED", createdAt: "2026-11-08T10:00:00Z", quote: { sale: { usd: "14.99" }, egp: { available: true, value: "750.00" } } },
  { orderId: "ORD-2", domain: "migo-egypt.net", operation: "registration", status: "AWAITING_PAYMENT", createdAt: "2026-11-08T11:00:00Z", quote: { sale: { usd: "13.99" }, egp: { available: false, value: null } } }
];

const DOMAINS = [
  { domain: "migo-egypt.com", status: "ACTIVE", expiresAt: "2027-11-08T10:00:00Z", nameservers: ["ns1.x", "ns2.x"], orderId: "ORD-1" },
  { domain: "migo-egypt.net", status: "EXPIRED", expiresAt: "2026-11-20T10:00:00Z", nameservers: ["ns1.x", "ns2.x"], orderId: "ORD-2" }
];

function routes(opts = {}) {
  return (url) => {
    if (url.endsWith("/domains")) {
      if (opts.domainsFail) return jsonResponse(500, { ok: false, error: { code: "PROVIDER_ERROR", message: "الخدمة واقعة." } });
      return jsonResponse(200, { ok: true, domains: opts.domains || [] });
    }
    if (url.endsWith("/orders")) {
      return jsonResponse(200, { ok: true, orders: opts.orders || [] });
    }
    return jsonResponse(404, { ok: false, error: { code: "NOT_FOUND", message: "مش موجود" } });
  };
}

async function openAccount(opts = {}) {
  const ctx = makeDom({
    api: opts.api === undefined ? API : opts.api,
    session: opts.session === undefined ? SESSION : opts.session,
    signedIn: opts.signedIn === undefined ? true : opts.signedIn,
    fetch: opts.fetch || routes(opts)
  });
  load(ctx, "api.js");
  load(ctx, "cart-store.js");
  load(ctx, "account.js");
  await settle();
  return ctx;
}

test("account: الطلبات بتتجاب من الخدمة وتتعرض بسعرها وحالتها", async () => {
  const ctx = await openAccount({ orders: ORDERS });
  const rows = ctx.__node("#ordBody").innerHTML;
  assert.match(rows, /ORD-1/);
  assert.match(rows, /migo-egypt\.com/);
  assert.match(rows, /750\.00 ج\.م/);
  assert.match(rows, /مكتمل/);
  assert.match(rows, /بانتظار الدفع/);
  // البند اللي ملهوش سعر بالجنيه بيتعرض بالدولار، مش برقم مخترع
  assert.match(rows, /\$13\.99/);
  assert.equal(ctx.__calls.filter((c) => c.url.endsWith("/orders")).length, 1);
});

test("account: مفيش طلبات -> رسالة فاضية واضحة", async () => {
  const ctx = await openAccount({ orders: [] });
  assert.match(ctx.__node("#ordBody").innerHTML, /مفيش طلبات/);
});

test("account: الخدمة مش مربوطة -> مفيش صفوف ولا أرقام", async () => {
  const ctx = await openAccount({ api: { baseUrl: "" } });
  assert.match(ctx.__node("#ordBody").innerHTML, /مش مربوطة/);
  assert.match(ctx.__node("[data-account-note]").innerHTML, /مش مربوطة/);
  assert.equal(ctx.__calls.length, 0);
});

test("account: من غير جلسة -> بيطلب تسجيل دخول ومش بينده الخدمة", async () => {
  const ctx = await openAccount({ signedIn: false, session: null });
  assert.match(ctx.__node("#ordBody").innerHTML, /سجّل دخولك/);
  assert.equal(ctx.__calls.length, 0);
});

test("account: فشل النداء بيظهر بكوّده", async () => {
  const ctx = await openAccount({
    fetch: () => jsonResponse(401, { ok: false, error: { code: "UNAUTHENTICATED", message: "الجلسة انتهت." } })
  });
  assert.match(ctx.__node("[data-account-note]").innerHTML, /UNAUTHENTICATED/);
  assert.match(ctx.__node("[data-account-note]").innerHTML, /الجلسة انتهت/);
});

test("account: الدومينات بتيجي من الخدمة وبحالتها وتاريخ انتهائها", async () => {
  const ctx = await openAccount({ domains: DOMAINS });
  const doms = ctx.__node("#domBody").innerHTML;
  assert.match(doms, /migo-egypt\.com/);
  assert.match(doms, /نشط/);
  assert.match(doms, /منتهي/);
  assert.match(doms, /2027/);

  const ren = ctx.__node("#renBody").innerHTML;
  assert.match(ren, /migo-egypt\.com/);
  assert.match(ren, /data-renew="migo-egypt\.com"/);

  assert.equal(ctx.__calls.filter((c) => c.url.endsWith("/domains")).length, 1);
});

test("account: مفيش دومينات -> رسالة واضحة في الجدولين", async () => {
  const ctx = await openAccount({ domains: [] });
  assert.match(ctx.__node("#domBody").innerHTML, /مفيش دومينات/);
  assert.match(ctx.__node("#renBody").innerHTML, /مفيش دومينات/);
});

test("account: فشل تحميل الدومينات بيظهر بسببه", async () => {
  const ctx = await openAccount({ domainsFail: true });
  assert.match(ctx.__node("#domBody").innerHTML, /تعذّر تحميل الدومينات/);
  assert.match(ctx.__node("#domBody").innerHTML, /الخدمة واقعة/);
});

test("account: زر التجديد بيضيف بند تجديد للسلة من غير أي سعر", async () => {
  const ctx = await openAccount({ domains: DOMAINS });
  const btn = ctx.__node("[data-renew]");
  btn.setAttribute("data-renew", "migo-egypt.com");
  ctx.__click(btn);
  const raw = ctx.localStorage.getItem("migo-cart");
  assert.match(raw, /"operation":"renewal"/);
  assert.match(raw, /migo-egypt\.com/);
  assert.equal(/price|usd|egp|amount/i.test(raw), false, "ممنوع أي سعر في السلة");
});

test("account.js: مفيش أرقام طلبات أو أسعار مكتوبة", () => {
  const code = codeOnly(src("account.js"));
  assert.equal(/\$\d/.test(code), false);
  assert.equal(/\d+\.\d{2}/.test(code), false);
  assert.equal(/ord-10\d\d/.test(code), false, "ممنوع أرقام طلبات وهمية");
});

test("account.html: مفيش أسعار ثابتة ولا كلام عن بيانات تجريبية", () => {
  const html = page("account.html");
  assert.equal(/\$\d+\.\d{2}/.test(html), false);
  assert.equal(/بيانات تجريبية/.test(html), false);
  assert.match(html, /data-account-note/);
});
