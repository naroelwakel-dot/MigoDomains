/* ==========================================================================
   اختبارات لوحة الإدارة (admin.html)
   --------------------------------------------------------------------------
   الهدف الأساسي: نثبّت إن **مفيش أي حساب تسعير في المتصفح**. لوحة الإدارة
   بتعرض الهامش وسعر البيع اللي بترجّعهم الخدمة بمحرك التسعير الرسمي.
   ========================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, load, jsonResponse, settle, src, page, codeOnly } from "./dom-harness.js";

const API = { baseUrl: "https://api.example.com" };
const SESSION = { access_token: "tok_admin" };

const PREVIEW = {
  priced: true,
  costUsd: "12.00",
  marginUsd: "3.00",
  saleUsd: "15.00",
  marginMicros: "3",
  saleMicros: "15",
  tier: { id: "tier_8_to_15", label: "من 8 إلى أقل من 15", rule: "+3.00 ثابت" },
  egp: { available: true, value: "750.00", rate: "50", source: "admin_manual" }
};

function routes(opts = {}) {
  const seen = [];
  const fetch = (url, init) => {
    seen.push({ url, init, body: init && init.body ? JSON.parse(init.body) : null });
    if (url.endsWith("/admin/price-preview")) {
      if (opts.refuse) return jsonResponse(200, { ok: true, preview: { priced: false, reason: "ZERO_COST_REQUIRES_DECISION", message: "التكلفة صفر بدون قرار تسعير صريح." } });
      if (opts.fail) return jsonResponse(403, { ok: false, error: { code: "FORBIDDEN", message: "العملية دي للإدارة بس" } });
      return jsonResponse(200, { ok: true, preview: opts.preview || PREVIEW });
    }
    return jsonResponse(404, { ok: false, error: { code: "NOT_FOUND", message: "مش موجود" } });
  };
  return { fetch, seen };
}

async function openAdmin(opts = {}) {
  const r = routes(opts);
  const ctx = makeDom({
    api: opts.api === undefined ? API : opts.api,
    session: opts.session === undefined ? SESSION : opts.session,
    signedIn: opts.signedIn === undefined ? true : opts.signedIn,
    fetch: r.fetch
  });
  ctx.__seen = r.seen;
  load(ctx, "api.js");
  load(ctx, "admin-data.js");
  load(ctx, "admin.js");
  await settle();
  return ctx;
}

/* ------------------------- ممنوع حساب في المتصفح ------------------------- */

test("admin.js: مفيش أي حساب تسعير في المتصفح", () => {
  const code = codeOnly(src("admin.js"));
  for (const banned of ["tomicros", "picktier", "pricefromcost", "migroadmincalc", "bigint", "marginmicros", "salemicros", "computemargin"]) {
    assert.equal(code.includes(banned), false, "ممنوع: " + banned);
  }
  assert.equal(/\$\d/.test(code), false, "ممنوع أي سعر مكتوب");
});

test("admin.js: بيطلب المعاينة من الخدمة", () => {
  const code = codeOnly(src("admin.js"));
  assert.match(code, /pricepreview/);
});

test("admin.html: بيحمّل config و auth و api قبل admin.js", () => {
  const html = page("admin.html");
  const i = (f) => html.indexOf("assets/js/" + f);
  assert.ok(i("config.js") > -1 && i("api.js") > -1 && i("auth.js") > -1);
  assert.ok(i("config.js") < i("api.js"), "config.js لازم يجي قبل api.js");
  assert.ok(i("api.js") < i("admin.js"), "api.js لازم يجي قبل admin.js");
  assert.match(html, /admin\/price-preview|محرك التسعير/);
});

/* ----------------------------- الحاسبة ----------------------------- */

test("الحاسبة: بترسل التكلفة للخدمة وتعرض الناتج منها", async () => {
  const ctx = await openAdmin();
  const inp = ctx.__node("#calcCost");
  inp.value = "12";
  ctx.__fire(inp, "input");
  await settle();

  const call = ctx.__seen.filter((c) => c.url.endsWith("/admin/price-preview")).pop();
  assert.ok(call, "الحاسبة مبعتتش للخدمة");
  assert.equal(call.init.method, "POST");
  assert.equal(call.body.costUsd, "12");
  assert.match(call.init.headers.authorization, /^Bearer tok_admin$/);

  const out = ctx.__node("#calcOut").innerHTML;
  assert.match(out, /3\.00/);
  assert.match(out, /15\.00/);
  assert.match(out, /من 8 إلى أقل من 15/);
  assert.match(out, /750\.00/);
});

test("الحاسبة: بنكتب سعر الصرف بيتمرّر للخدمة", async () => {
  const ctx = await openAdmin();
  const inp = ctx.__node("#calcCost");
  const fx = ctx.__node("#calcFx");
  inp.value = "12";
  fx.value = "50";
  ctx.__fire(fx, "input");
  await settle();
  const call = ctx.__seen.filter((c) => c.url.endsWith("/admin/price-preview")).pop();
  assert.equal(call.body.fx.rate, "50");
});

test("الحاسبة: الخدمة مش مربوطة -> بتقول كده ومش بتخترع رقم", async () => {
  const ctx = await openAdmin({ api: { baseUrl: "" } });
  const inp = ctx.__node("#calcCost");
  inp.value = "12";
  ctx.__fire(inp, "input");
  await settle();
  const out = ctx.__node("#calcOut").innerHTML;
  assert.match(out, /مش مربوطة/);
  assert.equal(/\$\d/.test(out), false);
  assert.equal(ctx.__seen.length, 0);
});

test("الحاسبة: من غير جلسة إدارية -> بتطلب تسجيل دخول", async () => {
  const ctx = await openAdmin({ signedIn: false, session: null });
  const inp = ctx.__node("#calcCost");
  inp.value = "12";
  ctx.__fire(inp, "input");
  await settle();
  assert.match(ctx.__node("#calcOut").innerHTML, /سجّل دخولك/);
  assert.equal(ctx.__seen.length, 0);
});

test("الحاسبة: رفض المحرك (تكلفة صفر) بيتعرض كنص مش كسعر", async () => {
  const ctx = await openAdmin({ refuse: true });
  const inp = ctx.__node("#calcCost");
  inp.value = "0";
  ctx.__fire(inp, "input");
  await settle();
  const out = ctx.__node("#calcOut").innerHTML;
  assert.match(out, /بدون قرار تسعير صريح/);
  assert.match(out, /ZERO_COST_REQUIRES_DECISION/);
  assert.equal(/\$\d/.test(out), false);
});

test("الحاسبة: فشل النداء بيتعرض بسببه", async () => {
  const ctx = await openAdmin({ fail: true });
  const inp = ctx.__node("#calcCost");
  inp.value = "12";
  ctx.__fire(inp, "input");
  await settle();
  const out = ctx.__node("#calcOut").innerHTML;
  assert.match(out, /FORBIDDEN/);
  assert.equal(/\$\d/.test(out), false);
});

/* --------------------------- تفاصيل الدومين --------------------------- */

test("تفاصيل الدومين: الأرقام الداخلية بتيجي من الخدمة", async () => {
  const ctx = await openAdmin();
  const btn = ctx.__node("[data-dom]");
  btn.setAttribute("data-dom", "migo-egypt.com");
  ctx.__click(btn);
  await settle();
  await settle();

  const call = ctx.__seen.filter((c) => c.url.endsWith("/admin/price-preview")).pop();
  assert.ok(call, "تفاصيل الدومين مبعتتش للخدمة");
  assert.equal(call.body.costUsd, "9.20", "بتاخد تكلفة الدومين من بيانات اللوحة");

  const body = ctx.__node("#detailMoney").innerHTML;
  assert.match(body, /3\.00/);
  assert.match(body, /15\.00/);
});
