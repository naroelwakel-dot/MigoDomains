/* ==========================================================================
   اختبارات عميل الـAPI ومخزن السلة (الواجهة)
   --------------------------------------------------------------------------
   بنشغّل ملفات الواجهة جوه بيئة نود (vm) بسيطة، من غير متصفح.
   الهدف: نتأكد إن الواجهة بتكلّم الخدمة صح، ومفيش أي سعر أو هامش بيتحسب هنا.
   ========================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const JS = path.join(dir, "..", "assets", "js");
const src = (f) => fs.readFileSync(path.join(JS, f), "utf8");

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear()
  };
}

function makeWindow(opts = {}) {
  const calls = [];
  const sandbox = {
    console,
    Promise, JSON, Error, Object, Array, String, Number, Boolean, RegExp, Date, Math,
    fetch: opts.fetch || function () { return Promise.reject(new Error("fetch not stubbed")); },
    MIGO_API: opts.MIGO_API || { baseUrl: "" },
    MigoAuth: opts.MigoAuth || { session: function () { return opts.session || null; } },
    localStorage: opts.localStorage || makeStorage()
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  ctx.__calls = calls;
  return ctx;
}

function load(ctx, file) {
  vm.runInContext(src(file), ctx, { filename: file });
  return ctx;
}

function stubFetch(responder) {
  return function (url, init) {
    return Promise.resolve(responder(url, init));
  };
}
function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status: status,
    text: function () { return Promise.resolve(JSON.stringify(body)); }
  };
}

/* ------------------------------------------------------------------ */
/* عميل الـAPI                                                         */
/* ------------------------------------------------------------------ */

test("api: version و isConfigured", () => {
  const ctx = load(makeWindow(), "api.js");
  assert.equal(ctx.migoApi.version, 1);
  assert.equal(ctx.migoApi.isConfigured(), false);
  assert.equal(ctx.migoApi.baseUrl(), "");

  const ok = load(makeWindow({ MIGO_API: { baseUrl: "https://api.example.com/" } }), "api.js");
  assert.equal(ok.migoApi.isConfigured(), true);
  assert.equal(ok.migoApi.baseUrl(), "https://api.example.com"); // الشرشة الزايدة بتتشال
});

test("api: أي نداء قبل الربط بيترفض بخطأ واضح", async () => {
  const ctx = load(makeWindow(), "api.js");
  await assert.rejects(() => ctx.migoApi.health(), (e) => e.code === "API_NOT_CONFIGURED");
  await assert.rejects(() => ctx.migoApi.search(["migo"], ["com"]), (e) => e.code === "API_NOT_CONFIGURED");
  await assert.rejects(() => ctx.migoApi.quote("migo.com", "registration"), (e) => e.code === "API_NOT_CONFIGURED");
});

test("api: health بيبعت GET على العنوان الصح", async () => {
  let seen = null;
  const ctx = load(makeWindow({
    MIGO_API: { baseUrl: "https://api.example.com" },
    fetch: stubFetch((url, init) => { seen = { url, init }; return jsonResponse(200, { ok: true, status: "healthy" }); })
  }), "api.js");

  const d = await ctx.migoApi.health();
  assert.equal(seen.url, "https://api.example.com/health");
  assert.equal(seen.init.method, "GET");
  assert.equal(d.status, "healthy");
});

test("api: search بيبعت الأسماء والامتدادات ويرجّع results بس", async () => {
  let seen = null;
  const results = [{ name: "migo.com", tld: "com", state: "AVAILABLE_CONFIRMED" }];
  const ctx = load(makeWindow({
    MIGO_API: { baseUrl: "https://api.example.com" },
    fetch: stubFetch((url, init) => { seen = { url, init }; return jsonResponse(200, { ok: true, results }); })
  }), "api.js");

  const out = await ctx.migoApi.search(["migo"], ["com", "net"]);
  assert.equal(seen.url, "https://api.example.com/search");
  assert.equal(seen.init.method, "POST");
  assert.deepEqual(JSON.parse(seen.init.body), { names: ["migo"], tlds: ["com", "net"] });
  assert.deepEqual(out, results);
});

test("api: quote بيرجّع ظرف الخدمة زي ما هو (من غير أي حساب محلي)", async () => {
  const envelope = { ok: true, quote: { sale: { usd: "14.99" }, egp: { available: false, value: null } } };
  const ctx = load(makeWindow({
    MIGO_API: { baseUrl: "https://api.example.com" },
    fetch: stubFetch(() => jsonResponse(200, envelope))
  }), "api.js");

  const d = await ctx.migoApi.quote("migo.com", "registration");
  assert.equal(d.quote.sale.usd, "14.99");
});

test("api: خطأ من الخدمة بيوصل بالكود بتاعه", async () => {
  const ctx = load(makeWindow({
    MIGO_API: { baseUrl: "https://api.example.com" },
    fetch: stubFetch(() => jsonResponse(409, { ok: false, error: { code: "IDEMPOTENCY_CONFLICT", message: "مفتاح مستخدم بطلب مختلف" } }))
  }), "api.js");

  await assert.rejects(() => ctx.migoApi.createOrder({ domain: "migo.com", idempotencyKey: "k1" }),
    (e) => e.code === "IDEMPOTENCY_CONFLICT" && e.status === 409);
});

test("api: رد مش JSON على 500 بيتحوّل لخطأ HTTP_500", async () => {
  const ctx = load(makeWindow({
    MIGO_API: { baseUrl: "https://api.example.com" },
    fetch: stubFetch(() => ({ ok: false, status: 500, text: () => Promise.resolve("boom") }))
  }), "api.js");

  await assert.rejects(() => ctx.migoApi.health(), (e) => e.code === "HTTP_500");
});

test("api: فشل الشبكة بيترجم لخطأ NETWORK", async () => {
  const ctx = load(makeWindow({
    MIGO_API: { baseUrl: "https://api.example.com" },
    fetch: () => Promise.reject(new TypeError("failed to fetch"))
  }), "api.js");

  await assert.rejects(() => ctx.migoApi.getOrder("o1"), (e) => e.code === "NETWORK");
});

test("api: توكن الجلسة بيتمرّر كـ Bearer، ومفيش توكن = مفيش هيدر", async () => {
  let seen = null;
  const ctx = load(makeWindow({
    MIGO_API: { baseUrl: "https://api.example.com" },
    session: { access_token: "tok_123" },
    fetch: stubFetch((url, init) => { seen = init; return jsonResponse(200, { ok: true, orders: [] }); })
  }), "api.js");
  await ctx.migoApi.listOrders();
  assert.equal(seen.headers.authorization, "Bearer tok_123");

  let seen2 = null;
  const ctx2 = load(makeWindow({
    MIGO_API: { baseUrl: "https://api.example.com" },
    fetch: stubFetch((url, init) => { seen2 = init; return jsonResponse(200, { ok: true, orders: [] }); })
  }), "api.js");
  await ctx2.migoApi.listOrders();
  assert.equal(seen2.headers.authorization, undefined);
});

test("api: createOrder بيبعت مفتاح منع التكرار في الهيدر والجسم", async () => {
  let seen = null;
  const ctx = load(makeWindow({
    MIGO_API: { baseUrl: "https://api.example.com" },
    fetch: stubFetch((url, init) => { seen = { url, init }; return jsonResponse(201, { ok: true, order: { id: "o1" } }); })
  }), "api.js");

  const order = await ctx.migoApi.createOrder({
    domain: "migo.com", operation: "registration", years: 1,
    registrant: { name: "أحمد", email: "a@example.com", country: "EG" },
    idempotencyKey: "key-9"
  });
  assert.equal(order.id, "o1");
  assert.equal(seen.init.headers["x-idempotency-key"], "key-9");
  const body = JSON.parse(seen.init.body);
  assert.equal(body.idempotencyKey, "key-9");
  assert.equal(body.domain, "migo.com");
  assert.equal(body.years, 1);
});

test("api: priceSummary بيفضّل الجنيه، وبيرجع دولار لو مفيش تحويل، ونلّ لو مفيش سعر", () => {
  const ctx = load(makeWindow(), "api.js");
  const p = ctx.migoApi.priceSummary;

  const a = p({ egp: { available: true, value: "750.00" }, sale: { usd: "14.99" } });
  assert.equal(a.text, "750.00 ج.م");
  assert.equal(a.currency, "EGP");

  const b = p({ egp: { available: false, value: null }, sale: { usd: "14.99" } });
  assert.equal(b.text, "$14.99");
  assert.equal(b.currency, "USD");

  assert.equal(p({ egp: { available: false }, sale: {} }), null);
  assert.equal(p(null), null);
});

test("api: stateLabel بتغطي كل حالات التوفّر المعروفة", () => {
  const ctx = load(makeWindow(), "api.js");
  const states = ["AVAILABLE_CONFIRMED", "REGISTERED", "PREMIUM", "RESERVED", "RESTRICTED", "UNKNOWN", "PROVIDER_ERROR", "MANUAL_REVIEW"];
  states.forEach((s) => {
    const l = ctx.migoApi.stateLabel(s);
    assert.ok(l.label && l.tone, "حالة ناقصة: " + s);
  });
  assert.equal(ctx.migoApi.stateLabel("SOMETHING_ELSE").label, "حالة غير معروفة");
});

// بوابتان أمنيتان على الملف نفسه: ممنوع أي حساب أسعار/هامش، وممنوع أي مفتاح خدمة.
// بنشيل سطور التعليقات الأول، عشان التحذيرات مكتوبة بصيغة الممنوع نفسه.
function codeOnly(file) {
  return src(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .toLowerCase();
}

test("api.js: مفيش مفردات تكلفة أو هامش جوه الملف", () => {
  const s = codeOnly("api.js");
  ["wholesale", "margin", "markup", "micros", "cost_per", "service_role", "service-role"].forEach((bad) => {
    assert.equal(s.includes(bad), false, "مفردة ممنوعة في api.js: " + bad);
  });
});

test("config.js: القيم فاضية ومفيش أي مفتاح سرّي", () => {
  const code = codeOnly("config.js");
  assert.equal(/service_role|service-role|secret_key|private_key/.test(code), false);
  const raw = src("config.js");
  assert.match(raw, /window\.MIGO_API\s*=\s*\{[\s\S]*?baseUrl:\s*""/);
  assert.match(raw, /window\.MIGO_AUTH\s*=\s*\{[\s\S]*?url:\s*""/);
});

/* ------------------------------------------------------------------ */
/* مخزن السلة                                                          */
/* ------------------------------------------------------------------ */

test("cart-store: إضافة، منع التكرار، إزالة، تفريغ، عدّ", () => {
  const ctx = load(makeWindow(), "cart-store.js");
  const c = ctx.migoCart;

  assert.equal(c.count(), 0);
  c.add({ domain: "migo.com", operation: "registration", years: 1 });
  c.add({ domain: "migo.com", operation: "registration", years: 1 }); // مكرر -> مرفوض
  assert.equal(c.count(), 1);

  c.add({ domain: "migo.net", operation: "registration", years: 1 });
  assert.equal(c.count(), 2);

  // نفس الدومين بعملية تانية = بند مختلف
  c.add({ domain: "migo.com", operation: "transfer", years: 1 });
  assert.equal(c.count(), 3);

  c.remove("migo.net");
  assert.deepEqual(c.items().map((i) => i.domain).sort(), ["migo.com", "migo.com"]);
  assert.equal(c.count(), 2);

  c.clear();
  assert.equal(c.count(), 0);
});

test("cart-store: البنود المحفوظة مالهاش أي سعر جوّاها", () => {
  const ctx = load(makeWindow(), "cart-store.js");
  ctx.migoCart.add({ domain: "migo.com", operation: "registration", years: 1 });
  const raw = ctx.localStorage.getItem("migo-cart");
  assert.equal(/price|usd|egp|amount/i.test(raw), false, "السلة مش المفروض تخزّن أي سعر");
});

test("cart-store: بيانات بايظة في التخزين ما بتكسرش الصفحة", () => {
  const ctx = load(makeWindow(), "cart-store.js");
  ctx.localStorage.setItem("migo-cart", "{not json");
  assert.equal(ctx.migoCart.count(), 0);
  assert.equal(ctx.migoCart.items().length, 0);
});
