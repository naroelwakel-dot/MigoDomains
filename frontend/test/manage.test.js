/* ==========================================================================
   اختبارات صفحة إدارة الدومين (manage.html)
   --------------------------------------------------------------------------
   الهدف: حفظ الـNameservers بيتنادى على الخدمة، والخدمة هي المرجع. لو
   الخدمة رفضت أو مش مربوطة، الصفحة ما تدّعيش إن التغيير حصل.
   ========================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, load, jsonResponse, settle, src, page, codeOnly } from "./dom-harness.js";

const API = { baseUrl: "https://api.example.com" };
const SESSION = { access_token: "tok_1" };
const NS = ["ns1.new-dns.test", "ns2.new-dns.test"];

function routes(opts = {}) {
  const seen = [];
  const fetch = (url, init) => {
    seen.push({ url, init, body: init && init.body ? JSON.parse(init.body) : null });
    if (url.endsWith("/dns")) {
      if (opts.reject) return jsonResponse(403, { ok: false, error: { code: "FORBIDDEN", message: "مالكش صلاحية على المورد ده" } });
      return jsonResponse(200, { ok: true, domain: "migo-egypt.com", nameservers: opts.applied || NS });
    }
    return jsonResponse(404, { ok: false, error: { code: "NOT_FOUND", message: "مش موجود" } });
  };
  return { fetch, seen };
}

async function openManage(opts = {}) {
  const r = routes(opts);
  const ctx = makeDom({
    api: opts.api === undefined ? API : opts.api,
    session: opts.session === undefined ? SESSION : opts.session,
    signedIn: opts.signedIn === undefined ? true : opts.signedIn,
    fetch: r.fetch
  });
  ctx.__seen = r.seen;
  load(ctx, "api.js");
  load(ctx, "manage.js");
  await settle();
  return ctx;
}

/** بيكتب الخوادم في الحقل ويبعت الفورم. */
function submitNs(ctx, value) {
  const input = ctx.__node("#nsInput");
  input.value = value === undefined ? NS.join("\n") : value;
  ctx.__fire(ctx.__node("#nsForm"), "submit");
}

/* ------------------------------ الشكل العام ------------------------------ */

test("manage.html: بيحمّل config و auth و api قبل manage.js", () => {
  const html = page("manage.html");
  const i = (f) => html.indexOf("assets/js/" + f);
  assert.ok(i("config.js") > -1 && i("api.js") > -1 && i("auth.js") > -1, "ملفات الربط ناقصة");
  assert.ok(i("config.js") < i("api.js"), "config.js لازم يجي قبل api.js");
  assert.ok(i("api.js") < i("manage.js"), "api.js لازم يجي قبل manage.js");
  assert.match(html, /حفظ الـNameservers هو الإجراء الوحيد المتوصل بالخدمة/);
});

test("manage.html: مفيش أسعار ثابتة في الصفحة", () => {
  assert.equal(/\$\d+\.\d{2}/.test(page("manage.html")), false);
});

/* ---------------------------- حفظ الـNameservers ---------------------------- */

test("حفظ الـNameservers: بيتبعت للخدمة بجلسة العميل", async () => {
  const ctx = await openManage();
  submitNs(ctx);
  await settle();

  const call = ctx.__seen.filter((c) => c.url.endsWith("/dns")).pop();
  assert.ok(call, "الطلب مبعتش للخدمة");
  assert.equal(call.init.method, "POST");
  assert.deepEqual(call.body.nameservers, NS);
  assert.equal(call.body.domain, "migo-egypt.com");
  assert.match(call.init.headers.authorization, /^Bearer tok_1$/);

  assert.match(ctx.__node("#nsHint").textContent, /أكّدت التحديث/);
  assert.match(ctx.__node("#nsBody").innerHTML, /ns1\.new-dns\.test/);
});

test("حفظ الـNameservers: الجدول بيعرض اللي الخدمة رجّعته، مش اللي اتكتب", async () => {
  const ctx = await openManage({ applied: ["ns9.provider.test", "ns8.provider.test"] });
  submitNs(ctx);
  await settle();
  const body = ctx.__node("#nsBody").innerHTML;
  assert.match(body, /ns9\.provider\.test/);
  assert.equal(/ns1\.new-dns\.test/.test(body), false, "ممنوع نعرض اللي كتبناه بدل رد الخدمة");
});

test("حفظ الـNameservers: رفض الخدمة بيظهر، ومفيش حفظ محلي", async () => {
  const ctx = await openManage({ reject: true });
  const before = ctx.__node("#nsBody").innerHTML;
  submitNs(ctx);
  await settle();
  const hint = ctx.__node("#nsHint").textContent;
  assert.match(hint, /الخدمة رفضت التغيير/);
  assert.match(hint, /مالكش صلاحية/);
  assert.match(hint, /FORBIDDEN/);
  assert.equal(ctx.__node("#nsBody").innerHTML, before, "الجدول اتغيّر من غير تأكيد الخدمة");
});

test("حفظ الـNameservers: الخدمة مش مربوطة -> مفيش نداء ومفيش ادّعاء حفظ", async () => {
  const ctx = await openManage({ api: { baseUrl: "" } });
  const before = ctx.__node("#nsBody").innerHTML;
  submitNs(ctx);
  await settle();
  assert.match(ctx.__node("#nsHint").textContent, /مش مربوطة/);
  assert.equal(ctx.__seen.length, 0);
  assert.equal(ctx.__node("#nsBody").innerHTML, before);
});

test("حفظ الـNameservers: من غير جلسة -> بيطلب تسجيل دخول", async () => {
  const ctx = await openManage({ signedIn: false, session: null });
  submitNs(ctx);
  await settle();
  assert.match(ctx.__node("#nsHint").textContent, /سجّل دخولك/);
  assert.equal(ctx.__seen.length, 0);
});

/* ------------------------------ الفحص المحلي ------------------------------ */

test("الفحص المحلي: أقل من خادمين = رفض من غير نداء للخدمة", async () => {
  const ctx = await openManage();
  submitNs(ctx, "ns1.only.test");
  await settle();
  assert.match(ctx.__node("#nsHint").textContent, /من 2 لـ6/);
  assert.equal(ctx.__seen.length, 0);
});

test("الفحص المحلي: اسم خادم غلط = رفض من غير نداء للخدمة", async () => {
  const ctx = await openManage();
  submitNs(ctx, "ns1.ok.test\nnot a host");
  await settle();
  assert.match(ctx.__node("#nsHint").textContent, /اسم خادم غير صحيح/);
  assert.equal(ctx.__seen.length, 0);
});

test("استعادة الافتراضي: بتروح للخدمة كمان، مش بتغيّر الصفحة بس", async () => {
  const ctx = await openManage({ applied: ["ns1.migo-dns.test", "ns2.migo-dns.test"] });
  ctx.__click(ctx.__node("#nsReset"));
  await settle();
  const call = ctx.__seen.filter((c) => c.url.endsWith("/dns")).pop();
  assert.ok(call, "الاستعادة مبعتتش للخدمة");
  assert.deepEqual(call.body.nameservers, ["ns1.migo-dns.test", "ns2.migo-dns.test"]);
});

/* --------------------------------- حماية --------------------------------- */

test("manage.js: القرار النهائي عند الخدمة (بينادي setNameservers)", () => {
  const code = codeOnly(src("manage.js"));
  assert.match(code, /setnameservers/);
  assert.match(code, /migoapi/);
  // ممنوع أي مفتاح سري في الواجهة
  assert.equal(/service_role|service_role_key/.test(code), false);
});
