/* ==========================================================================
   اختبارات صفحة تفاصيل الدومين + بوابات على صفحات الواجهة
   ========================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, load, jsonResponse, settle, src, page, codeOnly } from "./dom-harness.js";

const API = { baseUrl: "https://api.example.com" };

function responder(overrides = {}) {
  return (url) => {
    const path = url.replace(API.baseUrl, "").split("?")[0];
    if (path === "/availability") {
      return jsonResponse(200, { ok: true, result: overrides.availability || { state: "AVAILABLE_CONFIRMED", checkedAt: "2026-11-09T03:00:00Z" } });
    }
    if (path === "/quote") {
      return overrides.quote ? overrides.quote(url) : jsonResponse(200, {
        ok: true, quote: { sale: { usd: "14.99" }, egp: { available: true, value: "750.00" } }
      });
    }
    return jsonResponse(404, { ok: false, error: { code: "NOT_FOUND", message: "مش موجود" } });
  };
}

async function openDomain(opts = {}) {
  const ctx = makeDom({
    search: opts.search === undefined ? "?q=migo-egypt.com" : opts.search,
    api: opts.api === undefined ? API : opts.api,
    fetch: opts.fetch || responder(opts.responses)
  });
  load(ctx, "api.js");
  load(ctx, "cart-store.js");
  load(ctx, "domain.js");
  await settle();
  return ctx;
}

test("domain: الحالة والإجمالي والأسعار كلها بتيجي من الخدمة", async () => {
  const ctx = await openDomain({
    responses: {
      quote: (url) => {
        if (url.includes("/quote")) {
          const body = { sale: { usd: "14.99" }, egp: { available: true, value: "750.00" } };
          return jsonResponse(200, { ok: true, quote: body });
        }
        return jsonResponse(404, { ok: false, error: { code: "NOT_FOUND", message: "x" } });
      }
    }
  });
  const nodes = ctx.__nodes;

  assert.match(nodes["[data-state]"].innerHTML, /متاح/);
  assert.match(nodes["[data-state]"].innerHTML, /pill ok/);
  assert.equal(nodes["[data-total]"].textContent, "750.00 ج.م");
  assert.equal(nodes["[data-domain]#all"][0].textContent, "migo-egypt.com");
  assert.equal(nodes["[data-domain]#all"][1].textContent, "migo-egypt.com");

  const cards = nodes["[data-ops]"].innerHTML;
  assert.match(cards, /750\.00 ج\.م/);
  assert.match(cards, /سعر التجديد/);
  assert.match(cards, /سعر النقل/);

  const table = nodes["[data-ops-table]"].innerHTML;
  assert.match(table, /التسجيل/);
  assert.match(table, /النقل/);
  assert.match(table, /تحديث بيانات المالك/);

  assert.equal(nodes["[data-add]"].disabled, false);
  assert.equal(nodes["[data-add]"].getAttribute("data-domain-add"), "migo-egypt.com");
  assert.match(nodes["[data-pay]"].getAttribute("href"), /checkout\.html\?q=migo-egypt\.com/);
});

test("domain: الدومين المحجوز بيقفل زر السلة وبيغيّر النص", async () => {
  const ctx = await openDomain({ responses: { availability: { state: "REGISTERED" } } });
  const nodes = ctx.__nodes;
  assert.match(nodes["[data-state]"].innerHTML, /محجوز/);
  assert.match(nodes["[data-state]"].innerHTML, /pill danger/);
  assert.equal(nodes["[data-add]"].disabled, true);
  assert.match(nodes["[data-add]"].textContent, /مش متاح/);
});

test("domain: فشل عرض السعر بيظهر كنص واضح مش كرقم", async () => {
  const ctx = await openDomain({
    responses: {
      quote: () => jsonResponse(409, { ok: false, error: { code: "MOCK_NOT_A_REAL_PRICE", message: "المزوّد الحقيقي مش مربوط" } })
    }
  });
  const nodes = ctx.__nodes;
  assert.equal(nodes["[data-total]"].textContent, "-");
  assert.match(nodes["[data-ops]"].innerHTML, /المزوّد الحقيقي مش مربوط/);
  assert.equal(/\$\d/.test(nodes["[data-ops]"].innerHTML), false);
});

test("domain: الخدمة مش مربوطة -> مفيش أي سعر ولا رقم", async () => {
  const ctx = await openDomain({ api: { baseUrl: "" } });
  const nodes = ctx.__nodes;
  assert.match(nodes["[data-notice]"].innerHTML, /مش مربوطة/);
  assert.equal(nodes["[data-total]"].textContent, "-");
  assert.equal(nodes["[data-add]"].disabled, true);
  assert.equal(ctx.__calls.length, 0, "مفيش أي نداء لما العنوان فاضي");
});

test("domain: من غير دومين في العنوان -> رسالة واضحة", async () => {
  const ctx = await openDomain({ search: "" });
  assert.match(ctx.__nodes["[data-notice]"].innerHTML, /مفيش دومين مختار/);
});

test("domain: الإضافة للسلة بتخزّن الاختيار بس من غير سعر", async () => {
  const ctx = await openDomain();
  const add = ctx.__nodes["[data-add]"];
  ctx.__click(add);
  const raw = ctx.localStorage.getItem("migo-cart");
  assert.match(raw, /migo-egypt\.com/);
  assert.equal(/price|usd|egp|amount|750/i.test(raw), false, "ممنوع أي سعر في السلة");
});

/* ------------------------------------------------------------------ */
/* بوابات على الملفات نفسها                                           */
/* ------------------------------------------------------------------ */

test("domain.js: مفيش أي سعر مكتوب ولا ضرب في عدد السنين", () => {
  const code = codeOnly(src("domain.js"));
  assert.equal(/\$\d/.test(code), false, "ممنوع سعر ثابت في domain.js");
  assert.equal(/\d+\.\d{2}/.test(code), false, "ممنوع رقم سعر في domain.js");
  // ممنوع أي حساب أسعار في المتصفح: لا الضرب في عدد السنين ولا حساب فروق.
  ["years *", "* years", "usd *", "* usd", "egp *", "* egp", "price *", "* price"].forEach((bad) => {
    assert.equal(code.includes(bad), false, "حساب سعر في المتصفح: " + bad);
  });
  assert.equal(/tofixed\(|parsefloat\(|parseint\(/.test(code), false, "ممنوع تنسيق أو تحويل أرقام أسعار هنا");
});

test("domain.html: مفيش أي سعر مكتوب في الصفحة", () => {
  const html = page("domain.html");
  assert.equal(/\$\d+\.\d{2}/.test(html), false, "ممنوع سعر ثابت في domain.html");
  assert.match(html, /id="domain-app"/);
});

test("الصفحات المربوطة بالخدمة بتحمّل ملفاتها بالترتيب الصح", () => {
  ["search.html", "cart.html", "domain.html"].forEach((f) => {
    const html = page(f);
    const cfg = html.indexOf("assets/js/config.js");
    const api = html.indexOf("assets/js/api.js");
    const last = html.indexOf("assets/js/app.js");
    assert.ok(cfg > -1 && api > -1, f + ": لازم يحمّل config.js و api.js");
    assert.ok(api < html.lastIndexOf("assets/js/"), f + ": api.js لازم يكون قبل ملف الصفحة");
    assert.ok(last > -1, f + ": app.js مطلوب");
    assert.equal(/\$\d+\.\d{2}/.test(html), false, f + ": فيه سعر ثابت");
  });
});

test("مفيش أي مفتاح خدمة في أي ملف واجهة", () => {
  ["api.js", "cart-store.js", "domain.js", "search.js", "cart.js", "config.js"].forEach((f) => {
    assert.equal(/service_role|service-role|secret_key|private_key/.test(codeOnly(src(f))), false, f);
  });
});
