/* ==========================================================================
   اختبارات صفحة إتمام الطلب (checkout.html)
   ========================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, load, jsonResponse, settle, src, page, codeOnly } from "./dom-harness.js";

const API = { baseUrl: "https://api.example.com" };

const CART = [
  { domain: "migo-egypt.com", operation: "registration", years: 1 },
  { domain: "migo-egypt.net", operation: "registration", years: 1 }
];

function quoteFor(domain) {
  const value = domain.endsWith(".com") ? "750.00" : "800.00";
  return jsonResponse(200, { ok: true, quote: { sale: { usd: "14.99" }, egp: { available: true, value } } });
}

/* responder: بيرد على /quote و /order. orderOverride يتحكم في رد الطلب. */
function responder(opts = {}) {
  return (url, init) => {
    const path = url.replace(API.baseUrl, "").split("?")[0];
    if (path === "/quote") {
      if (opts.quote) return opts.quote(url, init);
      return quoteFor(JSON.parse(init.body).domain);
    }
    if (path === "/order") {
      if (opts.order) return opts.order(url, init);
      const body = JSON.parse(init.body);
      return jsonResponse(201, { ok: true, order: { orderId: "ORD-" + body.domain, domain: body.domain, status: "AWAITING_PAYMENT" } });
    }
    return jsonResponse(404, { ok: false, error: { code: "NOT_FOUND", message: "مش موجود" } });
  };
}

async function openCheckout(opts = {}) {
  const ctx = makeDom({
    api: opts.api === undefined ? API : opts.api,
    signedIn: opts.signedIn,
    policiesApproved: opts.policiesApproved,
    fetch: opts.fetch || responder(opts.responses)
  });
  if (opts.cart !== false) ctx.localStorage.setItem("migo-cart", JSON.stringify(opts.cart || CART));
  load(ctx, "api.js");
  load(ctx, "cart-store.js");
  load(ctx, "checkout.js");
  await settle();
  return ctx;
}

function fillForm(ctx, { name = "أحمد محمد", email = "ahmed@example.com", country = "EG", agree = true } = {}) {
  ctx.__node("#fname").value = name;
  ctx.__node("#email").value = email;
  ctx.__node("#country").value = country;
  ctx.__node("#agree").checked = agree;
}

const submit = (ctx) => ctx.__fire("#pay-form", "submit");
const orderCalls = (ctx) => ctx.__calls.filter((c) => c.url.endsWith("/order"));

/* ------------------------------------------------------------------ */
/* الملخص                                                              */
/* ------------------------------------------------------------------ */

test("checkout: الملخص والإجمالي من الخدمة، مش من الصفحة", async () => {
  const ctx = await openCheckout();
  const items = ctx.__nodes["[data-items]"].innerHTML;
  assert.match(items, /migo-egypt\.com/);
  assert.match(items, /750\.00 ج\.م/);
  assert.match(items, /800\.00 ج\.م/);
  assert.equal(ctx.__nodes["[data-total]"].textContent, "1550.00 ج.م");
  assert.equal(ctx.__calls.filter((c) => c.url.endsWith("/quote")).length, 2);
});

test("checkout: بند سعره بالدولار بس -> الإجمالي بالجنيه مش بيظهر", async () => {
  const ctx = await openCheckout({
    responses: {
      quote: () => jsonResponse(200, { ok: true, quote: { sale: { usd: "14.99" }, egp: { available: false, value: null } } })
    }
  });
  assert.equal(ctx.__nodes["[data-total]"].textContent, "لسه بيتحسب");
  assert.match(ctx.__nodes["[data-items]"].innerHTML, /\$14\.99/);
});

test("checkout: السلة الفاضية بتقول كده صراحةً", async () => {
  const ctx = await openCheckout({ cart: false });
  assert.match(ctx.__nodes["[data-notice]"].innerHTML, /سلتك فاضية/);
  assert.equal(ctx.__nodes["#payBtn"].disabled, true);
});

test("checkout: الخدمة مش مربوطة -> مفيش أي رقم", async () => {
  const ctx = await openCheckout({ api: { baseUrl: "" } });
  assert.match(ctx.__nodes["[data-notice]"].innerHTML, /مش مربوطة/);
  assert.equal(ctx.__nodes["[data-total]"].textContent, "-");
  assert.equal(ctx.__calls.length, 0);
  assert.equal(ctx.__nodes["#payBtn"].disabled, true);
});

/* ------------------------------------------------------------------ */
/* البوابات                                                           */
/* ------------------------------------------------------------------ */

test("checkout: التأكيد مقفول طول ما المستندات مسودة، ومفيش أي طلب بيتسجل", async () => {
  const ctx = await openCheckout(); // policiesApproved = false
  assert.match(ctx.__nodes["[data-policy-note]"].innerHTML, /مسودة/);

  fillForm(ctx);
  submit(ctx);
  await settle();

  assert.match(ctx.__nodes["[data-notice]"].innerHTML, /تسجيل الطلبات لسه مقفول/);
  assert.equal(orderCalls(ctx).length, 0, "ممنوع تسجيل طلب حقيقي والشروط مسودة");
});

test("checkout: من غير تسجيل دخول -> مفيش طلب، وبيوجّه لتسجيل الدخول", async () => {
  const ctx = await openCheckout({ policiesApproved: true, signedIn: false });
  fillForm(ctx);
  submit(ctx);
  await settle();
  assert.match(ctx.__nodes["[data-notice]"].innerHTML, /محتاج تسجيل دخول/);
  assert.equal(orderCalls(ctx).length, 0);
});

test("checkout: لازم موافقة على الشروط قبل أي إرسال", async () => {
  const ctx = await openCheckout({ policiesApproved: true, signedIn: true });
  fillForm(ctx, { agree: false });
  submit(ctx);
  await settle();
  assert.match(ctx.__nodes["[data-notice]"].innerHTML, /لازم توافق/);
  assert.equal(orderCalls(ctx).length, 0);
});

test("checkout: بيانات ناقصة أو دولة غلط بتتمنع محليًا", async () => {
  const ctx = await openCheckout({ policiesApproved: true, signedIn: true });
  fillForm(ctx, { email: "مش بريد", country: "مصر" });
  submit(ctx);
  await settle();
  const html = ctx.__nodes["[data-notice]"].innerHTML;
  assert.match(html, /بريد إلكتروني صحيح/);
  assert.match(html, /الدولة/);
  assert.equal(orderCalls(ctx).length, 0);
});

/* ------------------------------------------------------------------ */
/* تسجيل الطلب                                                        */
/* ------------------------------------------------------------------ */

test("checkout: بيسجّل طلب لكل بند بمفتاح منع تكرار، وبيفرّغ السلة", async () => {
  const ctx = await openCheckout({ policiesApproved: true, signedIn: true });
  fillForm(ctx);
  submit(ctx);
  await settle(10);

  const calls = orderCalls(ctx);
  assert.equal(calls.length, 2);
  const keys = calls.map((c) => c.init.headers["x-idempotency-key"]);
  assert.equal(new Set(keys).size, 2, "كل بند لازم مفتاح مختلف");

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.registrant.country, "EG");
  assert.equal(body.registrant.name, "أحمد محمد");
  assert.equal(body.years, 1);
  assert.equal(body.operation, "registration");

  const result = ctx.__nodes["[data-result]"].innerHTML;
  assert.match(result, /بانتظار الدفع/);
  assert.match(result, /مش مدفوعة/);
  assert.equal(ctx.migoCart.count(), 0, "السلة بتتفضّى بعد تسجيل الطلبات");
});

test("checkout: رفض من الخدمة بيظهر بكوّده، والسلة بتفضل زي ما هي", async () => {
  const ctx = await openCheckout({
    policiesApproved: true,
    signedIn: true,
    responses: {
      order: () => jsonResponse(409, { ok: false, error: { code: "DOMAIN_TAKEN", message: "الدومين اتسجل قبل كده." } })
    }
  });
  fillForm(ctx);
  submit(ctx);
  await settle(10);

  const html = ctx.__nodes["[data-notice]"].innerHTML;
  assert.match(html, /الدومين اتسجل قبل كده/);
  assert.match(html, /DOMAIN_TAKEN/);
  assert.equal(ctx.migoCart.count(), 2);
  assert.equal(ctx.__nodes["#payBtn"].disabled, false, "الزر يرجع شغال بعد الفشل");
});

/* ------------------------------------------------------------------ */
/* بوابات على الملفات                                                 */
/* ------------------------------------------------------------------ */

test("checkout.html: مفيش أي سعر مكتوب في الصفحة", () => {
  const html = page("checkout.html");
  assert.equal(/\$\d+\.\d{2}/.test(html), false, "ممنوع سعر ثابت في checkout.html");
  assert.equal(/\d+\.\d{2}\s*ج\.م/.test(html), false, "ممنوع سعر ثابت في checkout.html");
  assert.match(html, /id="checkout-app"/);
  assert.equal(/تجريبي/.test(html), false, "الصفحة مش تجريبية بعد كده");
});

test("checkout.js: ممنوع أي حساب أسعار غير جمع المعروض", () => {
  const code = codeOnly(src("checkout.js"));
  assert.equal(/\$\d/.test(code), false);
  assert.equal(/\d+\.\d{2}/.test(code), false);
  ["years *", "* years", "usd *", "* usd", "egp *", "* egp", "price *", "* price"].forEach((bad) => {
    assert.equal(code.includes(bad), false, "حساب سعر في المتصفح: " + bad);
  });
});

test("config.js: تأكيد الطلبات مقفول لحد اعتماد المستندات", () => {
  const raw = src("config.js");
  assert.match(raw, /window\.MIGO_CHECKOUT\s*=\s*\{[\s\S]*?policiesApproved:\s*false/);
});
