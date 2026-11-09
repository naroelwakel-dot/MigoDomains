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
const DNS = [
  { id: "rec-ns1", type: "NS", name: "@", value: "ns1.migo-dns.test", ttl: 3600, authority: true },
  { id: "rec-a", type: "A", name: "@", value: "192.0.2.10", ttl: 3600, authority: false }
];

function routes(opts = {}) {
  const seen = [];
  const fetch = (url, init) => {
    seen.push({ url, init, body: init && init.body ? JSON.parse(init.body) : null });
    if (url.indexOf("/dns/records") !== -1) {
      if (init && init.method === "POST") {
        if (opts.rejectDns) return jsonResponse(400, { ok: false, error: { code: "VALIDATION", message: "عنوان A غير صحيح" } });
        const records = opts.dnsApplied || JSON.parse(init.body).records.map((r, i) => ({ id: "rec-" + i, authority: false, ...r }));
        return jsonResponse(200, { ok: true, domain: "migo-egypt.com", replaced: true, records: records });
      }
      if (opts.records === null) return jsonResponse(404, { ok: false, error: { code: "NOT_FOUND", message: "مش موجود" } });
      return jsonResponse(200, { ok: true, domain: "migo-egypt.com", records: opts.records || DNS });
    }
    if (url.indexOf("/domain/") !== -1) {
      if (url.indexOf("/lock") !== -1) {
        if (opts.rejectLock) return jsonResponse(403, { ok: false, error: { code: "FORBIDDEN", message: "ممنوع تغيير القفل" } });
        return jsonResponse(200, { ok: true, domain: "migo-egypt.com", locked: JSON.parse(init.body).locked, locks: [] });
      }
      if (url.indexOf("/dnssec") !== -1) {
        return jsonResponse(200, { ok: true, domain: "migo-egypt.com", dnssec: JSON.parse(init.body).enabled });
      }
      if (url.indexOf("/transfer-eligibility") !== -1) {
        return jsonResponse(200, { ok: true, eligible: opts.eligible === true, reasons: opts.eligible ? [] : [{ code: "TRANSFER_LOCKED", message: "قفل النقل مفعّل (clientTransferProhibited)" }], status: "ACTIVE" });
      }
      if (url.indexOf("/auth-code") !== -1) {
        if (opts.rejectAuthCode) return jsonResponse(409, { ok: false, error: { code: "PROVIDER_ERROR", message: "المزوّد رفض استخراج الرمز" } });
        if (opts.noAuthCode) return jsonResponse(200, { ok: true, domain: "migo-egypt.com", authCode: null, sensitive: true });
        return jsonResponse(200, { ok: true, domain: "migo-egypt.com", authCode: "A7F3K9Q2M4X8P1Z6", sensitive: true, warning: "سرّي: ممنوع يتشارك في مكان عام أو سجل غير محمي" });
      }
      return jsonResponse(200, { ok: true, domain: "migo-egypt.com", details: opts.details || {
        domain: "migo-egypt.com", status: "ACTIVE", registeredAt: "2025-11-12", expiresAt: "2028-01-05",
        nameservers: ["ns1.migo-dns.test", "ns2.migo-dns.test"], transferLock: false, locks: [], dnssec: false,
        registrant: { name: "أحمد العميل", email: "owner@example.test", country: "EG" },
        contacts: {
          registrant: { name: "أحمد العميل", email: "owner@example.test", country: "EG" },
          admin: { name: "أحمد العميل", email: "admin@example.test", country: "EG" },
          tech: { name: "فريق Migo", email: "tech@migo.test", country: "EG" },
          billing: { name: "حسابات Migo", email: "billing@migo.test", country: "EG" }
        }
      } });
    }
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
  assert.match(html, /الـNameservers وسجلات DNS وقفل النقل وDNSSEC وتفاصيل الدومين وجهات الاتصال ورمز النقل وأهلية النقل كلها بتيجي من الخدمة/);
  assert.match(html, /اللي لسه مش موصّل: تعديل بيانات الاتصال/);
  assert.match(html, /مفيش زرار فيهم بيدّعي نجاح/);
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
  const before = ctx.__seen.length;
  submitNs(ctx, "ns1.only.test");
  await settle();
  assert.match(ctx.__node("#nsHint").textContent, /من 2 لـ6/);
  assert.equal(ctx.__seen.length, before, "ممنوع نداء الخدمة على بيانات غلط");
});

test("الفحص المحلي: اسم خادم غلط = رفض من غير نداء للخدمة", async () => {
  const ctx = await openManage();
  const before = ctx.__seen.length;
  submitNs(ctx, "ns1.ok.test\nnot a host");
  await settle();
  assert.match(ctx.__node("#nsHint").textContent, /اسم خادم غير صحيح/);
  assert.equal(ctx.__seen.length, before, "ممنوع نداء الخدمة على بيانات غلط");
});

test("استعادة الافتراضي: بتروح للخدمة كمان، مش بتغيّر الصفحة بس", async () => {
  const ctx = await openManage({ applied: ["ns1.migo-dns.test", "ns2.migo-dns.test"] });
  ctx.__click(ctx.__node("#nsReset"));
  await settle();
  const call = ctx.__seen.filter((c) => c.url.endsWith("/dns")).pop();
  assert.ok(call, "الاستعادة مبعتتش للخدمة");
  assert.deepEqual(call.body.nameservers, ["ns1.migo-dns.test", "ns2.migo-dns.test"]);
});

/* ------------------------------ سجلات DNS ------------------------------ */

async function openDns(opts = {}) {
  const ctx = await openManage(opts);
  await settle();
  return ctx;
}

/** بيملّي فورم إضافة السجل ويبعته. */
function addRecord(ctx, { type = "A", name = "@", value = "198.51.100.7", ttl = "3600" } = {}) {
  ctx.__node("#dnsType").value = type;
  ctx.__node("#dnsName").value = name;
  ctx.__node("#dnsValue").value = value;
  ctx.__node("#dnsTtl").value = ttl;
  ctx.__fire(ctx.__node("#dnsForm"), "submit");
}

/** بيضغط زر الحذف في صف معيّن. */
function clickDelete(ctx, index) {
  const body = ctx.__node("#dnsBody");
  body.setAttribute("data-del", String(index));
  ctx.__fire(body, "click");
  delete body._attrs["data-del"];
}

test("السجلات بتتجاب من الخدمة أول ما الصفحة تفتح", async () => {
  const ctx = await openDns({ records: [
    { id: "rec-1", type: "A", name: "@", value: "203.0.113.9", ttl: 300, authority: false }
  ] });
  const call = ctx.__seen.filter((c) => c.url.indexOf("/dns/records") !== -1).pop();
  assert.ok(call, "الصفحة مجابتش السجلات من الخدمة");
  assert.match(call.url, /domain=migo-egypt\.com/);
  assert.match(call.init.headers.authorization, /^Bearer tok_1$/);
  assert.match(ctx.__node("#dnsBody").innerHTML, /203\.0\.113\.9/);
});

test("الإضافة بتبعت الـzone كاملة للخدمة، والجدول بيعرض رد الخدمة", async () => {
  const ctx = await openDns();
  addRecord(ctx, { type: "A", name: "app", value: "198.51.100.7" });
  await settle();

  const call = ctx.__seen.filter((c) => c.url.endsWith("/dns/records") && c.init.method === "POST").pop();
  assert.ok(call, "الطلب مبعتش للخدمة");
  assert.equal(call.body.domain, "migo-egypt.com");
  assert.ok(call.body.records.some((r) => r.type === "A" && r.value === "198.51.100.7"), "السجل الجديد مش في الطلب");
  assert.match(ctx.__node("#dnsHint").textContent, /أكّدت التحديث/);
});

test("سجلات السلطة مش بتتبعت للخدمة أبدًا", async () => {
  const ctx = await openDns();
  addRecord(ctx);
  await settle();
  const call = ctx.__seen.filter((c) => c.url.endsWith("/dns/records") && c.init.method === "POST").pop();
  const types = call.body.records.map((r) => r.type);
  assert.equal(types.includes("NS"), false, "سجلات السلطة ممنوعة في الطلب");
  assert.equal(types.includes("CAA"), false);
});

test("الحذف بيعيد بعت الـzone بدون السجل", async () => {
  const ctx = await openDns({ records: [
    { id: "a", type: "A", name: "@", value: "192.0.2.1", ttl: 3600, authority: false },
    { id: "b", type: "TXT", name: "@", value: "v=spf1 -all", ttl: 3600, authority: false }
  ] });
  clickDelete(ctx, 1);
  await settle();
  const call = ctx.__seen.filter((c) => c.url.endsWith("/dns/records") && c.init.method === "POST").pop();
  assert.ok(call, "الحذف مبعتش للخدمة");
  assert.deepEqual(call.body.records.map((r) => r.value), ["192.0.2.1"]);
});

test("حذف سجل سلطة مرفوض من غير أي نداء", async () => {
  const ctx = await openDns();
  const before = ctx.__seen.length;
  clickDelete(ctx, 0); // أول سجل = NS (authority)
  await settle();
  assert.equal(ctx.__seen.length, before, "ممنوع نداء الخدمة على سجل سلطة");
  assert.match(ctx.__node("#dnsBody").innerHTML, /NS/);
});

test("رفض الخدمة بيظهر بالرسالة والكود، والجدول ما بيتغيّرش", async () => {
  const ctx = await openDns({ rejectDns: true });
  const before = ctx.__node("#dnsBody").innerHTML;
  addRecord(ctx, { value: "198.51.100.9" });
  await settle();
  const hint = ctx.__node("#dnsHint").textContent;
  assert.match(hint, /الخدمة رفضت التغيير/);
  assert.match(hint, /VALIDATION/);
  assert.equal(ctx.__node("#dnsBody").innerHTML, before, "الجدول اتغيّر من غير تأكيد الخدمة");
});

test("الخدمة مش مربوطة: مفيش نداء ولا حفظ، والديمو باقي", async () => {
  const ctx = await openDns({ api: { baseUrl: "" } });
  const before = ctx.__node("#dnsBody").innerHTML;
  addRecord(ctx);
  await settle();
  assert.equal(ctx.__seen.length, 0);
  assert.match(ctx.__node("#dnsHint").textContent, /مش مربوطة/);
  assert.equal(ctx.__node("#dnsBody").innerHTML, before);
});

test("من غير جلسة: بيطلب تسجيل دخول من غير نداء", async () => {
  const ctx = await openDns({ signedIn: false, session: null });
  addRecord(ctx);
  await settle();
  assert.equal(ctx.__seen.length, 0);
  assert.match(ctx.__node("#dnsHint").textContent, /سجّل دخولك/);
});

test("الفحص المحلي: IPv4 غلط = رفض من غير نداء للخدمة", async () => {
  const ctx = await openDns();
  const before = ctx.__seen.length;
  addRecord(ctx, { type: "A", value: "999.1.1.1" });
  await settle();
  assert.match(ctx.__node("#dnsError").textContent, /A لازم يكون IPv4/);
  assert.equal(ctx.__seen.length, before, "ممنوع نداء الخدمة على بيانات غلط");
});

/* --------------------- التفاصيل والأمان وأهلية النقل --------------------- */

test("تفاصيل الدومين بتتجاب من الخدمة وتظهر في الصفحة", async () => {
  const ctx = await openDns();
  const call = ctx.__seen.filter((c) => /\/domain\//.test(c.url) && c.url.indexOf("/lock") === -1 && c.url.indexOf("/dnssec") === -1 && c.url.indexOf("/transfer-eligibility") === -1).pop();
  assert.ok(call, "الصفحة مجابتش تفاصيل الدومين من الخدمة");
  assert.match(ctx.__node("#ownerValue").textContent, /owner@example\.test/);
  assert.match(ctx.__node("#createdValue").textContent, /12\/11\/2025/);
});

test("قفل النقل بيتغيّر على الخدمة، والصفحة بتعكس رد الخدمة", async () => {
  const ctx = await openDns();
  ctx.__click(ctx.__node("#lockToggle"));
  await settle();
  const call = ctx.__seen.filter((c) => c.url.indexOf("/lock") !== -1).pop();
  assert.ok(call, "التغيير مبعتش للخدمة");
  assert.equal(call.init.method, "POST");
  assert.equal(call.body.locked, true, "القفل كان متوقف فالمطلوب يفعّله");
  assert.match(ctx.__node("#lockToggle").textContent, /مفعّل/);
  assert.match(ctx.__node("#securityHint").textContent, /أكّدت التحديث/);
});

test("DNSSEC بيتغيّر على الخدمة كمان", async () => {
  const ctx = await openDns();
  ctx.__click(ctx.__node("#dnssecToggle"));
  await settle();
  const call = ctx.__seen.filter((c) => c.url.indexOf("/dnssec") !== -1).pop();
  assert.ok(call, "التغيير مبعتش للخدمة");
  assert.equal(call.body.enabled, true);
  assert.match(ctx.__node("#dnssecToggle").textContent, /مفعّل/);
});

test("رفض الخدمة للقفل بيظهر، ومفيش تغيير محلي", async () => {
  const ctx = await openDns({ rejectLock: true });
  ctx.__click(ctx.__node("#lockToggle"));
  await settle();
  assert.match(ctx.__node("#securityHint").textContent, /الخدمة رفضت التغيير/);
  assert.match(ctx.__node("#securityHint").textContent, /FORBIDDEN/);
  assert.match(ctx.__node("#lockToggle").textContent, /متوقف/, "الحالة المحلية اتغيّرت من غير تأكيد الخدمة");
});

test("الخدمة مش مربوطة: التوجل بيقول كده ومفيش نداء", async () => {
  const ctx = await openDns({ api: { baseUrl: "" } });
  ctx.__click(ctx.__node("#lockToggle"));
  await settle();
  assert.equal(ctx.__seen.length, 0);
  assert.match(ctx.__node("#securityHint").textContent, /مش مربوطة/);
});

test("أهلية النقل بتتجاب من الخدمة، والأسباب بتظهر والزرار مقفول", async () => {
  const ctx = await openDns({ eligible: false });
  const call = ctx.__seen.filter((c) => c.url.indexOf("/transfer-eligibility") !== -1).pop();
  assert.ok(call, "الصفحة مجابتش الأهلية من الخدمة");
  assert.match(ctx.__node("#eligList").innerHTML, /قفل النقل مفعّل/);
  assert.equal(ctx.__node("#startTransfer").disabled, true);
});

test("أهلية متحققة عند الخدمة = الزرار مفتوح", async () => {
  const ctx = await openDns({ eligible: true });
  assert.equal(ctx.__node("#startTransfer").disabled, false);
  assert.match(ctx.__node("#eligResult").innerHTML, /مؤهّل للنقل/);
});

/* --------------------------- جهات الاتصال ورمز النقل --------------------------- */

test("جهات الاتصال بتتجاب من الخدمة وتظهر في التبويب", async () => {
  const ctx = await openDns();
  const call = ctx.__seen.filter((c) => /\/domain\/[^/]+$/.test(c.url)).pop();
  assert.ok(call, "الصفحة مجابتش تفاصيل الدومين من الخدمة");
  const grid = ctx.__node("#contactsGrid").innerHTML;
  assert.match(grid, /admin@example\.test/);
  assert.match(grid, /tech@migo\.test/);
  assert.match(grid, /حسابات Migo/);
  assert.equal(/>ahmed@example\.test</.test(grid), false, "فضلت بيانات تجريبية مع إن الخدمة رجّعت بياناتها");
});

test("من غير خدمة: جهات الاتصال بترجع للعرض التجريبي", async () => {
  const ctx = await openDns({ api: { baseUrl: "" } });
  assert.match(ctx.__node("#contactsGrid").innerHTML, /ahmed@example\.test/);
  assert.equal(ctx.__seen.length, 0);
});

test("إظهار رمز النقل بيطلبه من الخدمة عند الطلب بس", async () => {
  const ctx = await openDns();
  assert.equal(ctx.__seen.filter((c) => c.url.indexOf("/auth-code") !== -1).length, 0, "الرمز اتطلب من غير طلب المستخدم");
  assert.match(ctx.__node("#authValue").textContent, /•/, "الرمز ظاهر من غير طلب");

  ctx.__click(ctx.__node("#authToggle"));
  await settle();
  const call = ctx.__seen.filter((c) => c.url.indexOf("/auth-code") !== -1).pop();
  assert.ok(call, "الرمز مطلوبش من الخدمة");
  assert.equal(call.init.method, "GET");
  assert.equal(ctx.__node("#authValue").textContent, "A7F3K9Q2M4X8P1Z6");
  assert.match(ctx.__node("#authHint").textContent, /سرّي/);
  assert.equal(ctx.__node("#authCopy").hidden, false);

  ctx.__click(ctx.__node("#authToggle"));
  assert.match(ctx.__node("#authValue").textContent, /•/);
  assert.equal(ctx.__node("#authCopy").hidden, true, "زرار النسخ فضل ظاهر بعد الإخفاء");
});

test("رفض الخدمة لطلب الرمز بيظهر، والرمز مش بيتعرض", async () => {
  const ctx = await openDns({ rejectAuthCode: true });
  ctx.__click(ctx.__node("#authToggle"));
  await settle();
  assert.match(ctx.__node("#authHint").textContent, /الخدمة رفضت طلب الرمز/);
  assert.match(ctx.__node("#authHint").textContent, /PROVIDER_ERROR/);
  assert.match(ctx.__node("#authValue").textContent, /•/, "اتعرض رمز من غير تأكيد الخدمة");
});

test("الخدمة مش مربوطة: طلب الرمز بيقول كده ومفيش نداء", async () => {
  const ctx = await openDns({ api: { baseUrl: "" } });
  ctx.__click(ctx.__node("#authToggle"));
  await settle();
  assert.equal(ctx.__seen.length, 0);
  assert.match(ctx.__node("#authHint").textContent, /مش مربوطة/);
});

/* --------------------- اللي لسه مش موصّل: لازم يقول كده --------------------- */

test("بدء النقل: بيقول إنه مش موصّل، ومفيش أي نداء للخدمة", async () => {
  const ctx = await openDns({ eligible: true });
  const before = ctx.__seen.length;
  assert.equal(ctx.__node("#startTransfer").disabled, false, "الزرار لازم يبقى مفتوح لو الأهلية متحققة");
  ctx.__click(ctx.__node("#startTransfer"));
  await settle();
  assert.match(ctx.__node("#transferHint").textContent, /مابعتش/);
  assert.match(ctx.__node("#transferHint").textContent, /نقل خارج/);
  assert.equal(ctx.__seen.length, before, "ممنوع أي نداء خدمة على إجراء مش موصّل");
});

test("manage.html: الأزرار اللي مش موصّلة مابتقولش نجاح ولا (تجريبي)", () => {
  const html = page("manage.html");
  assert.equal(/بدأ طلب نقل تجريبي/.test(html), false);
  assert.equal(/data-toast="تجديد[^"]*\(تجريبي\)/.test(html), false, "زرار التجديد لسه بيوعد بنجاح تجريبي");
  assert.match(html, /التجديد لسه مش موصّل/);
  assert.match(html, /مستنية قرار بوابة الدفع/);
});

test("manage.js: رسالة تعديل جهات الاتصال بتقول سبب التعطّل", () => {
  const code = codeOnly(src("manage.js"));
  assert.match(code, /مافيهوش دالة تعديل جهات الاتصال/);
  assert.equal(/بدأ طلب نقل تجريبي/.test(code), false, "لسه فيه رسالة نجاح تجريبية");
});

/* --------------------------------- حماية --------------------------------- */

test("manage.js: القرار النهائي عند الخدمة (بينادي setNameservers)", () => {
  const code = codeOnly(src("manage.js"));
  assert.match(code, /setnameservers/);
  assert.match(code, /getdnsrecords/);
  assert.match(code, /updatednsrecords/);
  assert.match(code, /settransferlock/);
  assert.match(code, /setdnssec/);
  assert.match(code, /gettransfereligibility/);
  assert.match(code, /getdomain/);
  assert.match(code, /getauthcode/);
  assert.match(code, /migoapi/);
  // ممنوع أي مفتاح سري في الواجهة
  assert.equal(/service_role|service_role_key/.test(code), false);
  // ممنوع رمز نقل مخزّن في الصفحة
  assert.equal(/a7f3k9q2m4x8p1z6/.test(code), false, "فيه رمز نقل مكتوب جوه الصفحة");
});
