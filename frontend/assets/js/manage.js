/* ==========================================================================
   Migo Domains - إدارة الدومين (صفحة manage.html)
   --------------------------------------------------------------------------
   بيانات تجريبية فقط. مفيش أي اتصال بمزوّد، ومفيش أي اتصال خارجي، ومفيش أي
   مفاتيح. والقواعد هنا **مرآة** لقواعد المزوّد الحقيقية في providers/lib/mock.js
   (نفس تحقق الـNameservers ونفس IPv4 ونفس حدود TTL ونفس قاعدة الملكية)، عشان
   الواجهة ترفض اللي المزوّد هيرفضه، مش العكس.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var toast = function (m, k) { if (window.migoToast) window.migoToast(m, k); };

  /* ------------------------------------------------------------------ الحالة */
  var TODAY = new Date("2026-11-08T00:00:00Z");
  var DAY = 24 * 60 * 60 * 1000;

  var STATE = {
    name: "migo-egypt.com",
    status: "ACTIVE",
    statusLabel: "نشط",
    created: "2025-11-12",
    expires: "2027-11-12",
    lastTransferAt: null,
    autoRenew: true,
    providerConnected: false,
    lock: true,
    dnssec: false,
    authCode: "A7F3K9Q2M4X8P1Z6",
    owner: "ahmed@example.test",
    nameservers: ["ns1.migo-dns.test", "ns2.migo-dns.test"],
    records: [
      { type: "NS", name: "@", value: "ns1.migo-dns.test", ttl: 3600, authority: true },
      { type: "NS", name: "@", value: "ns2.migo-dns.test", ttl: 3600, authority: true },
      { type: "A", name: "@", value: "192.0.2.10", ttl: 3600, authority: false },
      { type: "CNAME", name: "www", value: "migo-egypt.com", ttl: 3600, authority: false },
      { type: "MX", name: "@", value: "mail.example.test", ttl: 3600, authority: false },
      { type: "TXT", name: "@", value: "v=spf1 -all", ttl: 3600, authority: false }
    ]
  };

  /* ------------------------------------------------------------------ أدوات */
  function pill(kind, label) {
    return '<span class="pill ' + kind + '">' + label + "</span>";
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function fmt(d) { return iso(d).split("-").reverse().join("/"); }

  /* نفس تحقق المزوّد: اسم خادم صحيح */
  var HOSTNAME = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
  /* نفس تحقق المزوّد: IPv4 بمدى 0-255 وبدون أصفار بادئة */
  function isIPv4(v) {
    var p = String(v).split(".");
    if (p.length !== 4) return false;
    return p.every(function (x) { return /^(0|[1-9]\d{0,2})$/.test(x) && Number(x) <= 255; });
  }
  /* نفس قاعدة المزوّد: بيانات الموزّع ممنوعة كمالك رسمي */
  var RESELLER_TOKENS = ["migo", "naroelwakel"];

  /* -------------------------------------------------------- بطاقات النظرة العامة */
  var expires = new Date(STATE.expires + "T00:00:00Z");
  var daysLeft = Math.ceil((expires.getTime() - TODAY.getTime()) / DAY);
  $("#expiryValue").textContent = fmt(expires);
  $("#daysLeftValue").textContent = daysLeft + " يوم متبقي";
  $("#autoRenewValue").textContent = STATE.autoRenew ? "مفعّل" : "متوقف";
  $("#createdValue").textContent = fmt(new Date(STATE.created + "T00:00:00Z"));
  $("#ownerValue").textContent = STATE.owner;
  $("#providerPill").textContent = STATE.providerConnected ? "متصل" : "غير متصل";
  $("#providerPill").className = "pill " + (STATE.providerConnected ? "ok" : "warn");

  /* ------------------------------------------------------------ تبويب: Nameservers */
  function renderNs() {
    $("#nsBody").innerHTML = STATE.nameservers.map(function (ns, i) {
      return "<tr><td>" + (i + 1) + "</td><td class=\"mono\">" + esc(ns) + "</td><td>" +
        pill("ok", "مستجيب") + "</td></tr>";
    }).join("");
    var input = $("#nsInput");
    if (input && document.activeElement !== input) input.value = STATE.nameservers.join("\n");
    $("#nsPreview").innerHTML = '<p class="hint">عدد الخوادم الحالي: ' + STATE.nameservers.length +
      " من 6 كحد أقصى.</p>";
  }

  $("#nsForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var lines = $("#nsInput").value.split("\n").map(function (s) { return s.trim().toLowerCase(); })
      .filter(function (s) { return s !== ""; });
    var hint = $("#nsHint");
    if (lines.length < 2 || lines.length > 6) {
      hint.className = "hint error";
      hint.textContent = "عدد الـNameservers لازم يكون من 2 لـ6، والعدد الحالي " + lines.length + ".";
      return;
    }
    var bad = lines.filter(function (n) { return !HOSTNAME.test(n); });
    if (bad.length) {
      hint.className = "hint error";
      hint.textContent = "اسم خادم غير صحيح: " + bad.join(" · ");
      return;
    }
    hint.className = "hint";
    hint.textContent = "الشكل صحيح (2 لـ6 خوادم).";
    STATE.nameservers = lines;
    STATE.records = STATE.records.filter(function (r) { return !r.authority; });
    STATE.records.unshift(
      { type: "NS", name: "@", value: lines[0], ttl: 3600, authority: true },
      { type: "NS", name: "@", value: lines[1], ttl: 3600, authority: true }
    );
    renderNs();
    renderDns();
    toast("تم تحديث الـNameservers (تجريبي، ومش محفوظ)", "ok");
  });

  $("#nsReset").addEventListener("click", function () {
    STATE.nameservers = ["ns1.migo-dns.test", "ns2.migo-dns.test"];
    renderNs();
    renderDns();
    toast("رجعنا للـNameservers الافتراضية", "");
  });

  /* ------------------------------------------------------------------ تبويب: DNS */
  function renderDns() {
    $("#dnsBody").innerHTML = STATE.records.map(function (r, i) {
      var control = r.authority
        ? '<span class="dim" style="font-size:var(--fs-xs)">من تبويب Nameservers</span>'
        : '<button class="btn btn-sm btn-danger" type="button" data-del="' + i + '">حذف</button>';
      return '<tr><td class="mono">' + esc(r.type) + '</td><td class="mono">' + esc(r.name) +
        '</td><td class="mono">' + esc(r.value) + "</td><td class=\"mono\">" + r.ttl +
        "</td><td>" + control + "</td></tr>";
    }).join("");
  }
  $("#dnsBody").addEventListener("click", function (e) {
    var b = e.target.closest("[data-del]");
    if (!b) return;
    var i = Number(b.getAttribute("data-del"));
    var rec = STATE.records[i];
    if (!rec || rec.authority) { toast("سجلات السلطة مش بتتحذف من هنا", "danger"); return; }
    STATE.records.splice(i, 1);
    renderDns();
    toast("اتشال السجل " + rec.type + " (تجريبي)", "warn");
  });

  $("#dnsForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var type = $("#dnsType").value;
    var name = $("#dnsName").value.trim() || "@";
    var value = $("#dnsValue").value.trim();
    var ttl = Number($("#dnsTtl").value);
    var err = $("#dnsError");
    var fail = function (m) { err.hidden = false; err.textContent = m; };

    if (!value) return fail("القيمة مطلوبة.");
    if (type === "A" && !isIPv4(value)) return fail("عنوان A لازم يكون IPv4 صحيح، وكل خانة من 0 لـ255.");
    if (type === "AAAA" && !/^[0-9a-fA-F:]+$/.test(value)) return fail("عنوان AAAA غير صحيح.");
    if (!Number.isInteger(ttl) || ttl < 60 || ttl > 86400) return fail("TTL لازم يكون من 60 لـ86400 ثانية.");

    err.hidden = true;
    STATE.records.push({ type: type, name: name, value: value, ttl: ttl, authority: false });
    renderDns();
    $("#dnsValue").value = "";
    toast("اتضاف السجل " + type + " (تجريبي)", "ok");
  });

  /* ------------------------------------------------------------ تبويب: جهات الاتصال */
  var CONTACTS = [
    { role: "Registrant", note: "صاحب الدومين", name: "أحمد العميل", email: "ahmed@example.test" },
    { role: "Admin", note: "الإدارة التقنية", name: "أحمد العميل", email: "ahmed@example.test" },
    { role: "Tech", note: "الدعم الفني", name: "أحمد العميل", email: "ahmed@example.test" },
    { role: "Billing", note: "الفوترة", name: "أحمد العميل", email: "ahmed@example.test" }
  ];
  $("#contactsGrid").innerHTML = CONTACTS.map(function (c) {
    return '<div class="card"><div class="row-between"><h3 class="h3">' + c.role + "</h3>" +
      pill(c.role === "Registrant" ? "accent" : "info", c.note) + "</div>" +
      '<div class="mt-3 row-between"><span class="muted">الاسم</span><span>' + esc(c.name) + "</span></div>" +
      '<div class="mt-2 row-between"><span class="muted">البريد</span><span class="mono">' + esc(c.email) + "</span></div>" +
      '<button class="btn btn-sm mt-4" type="button" data-toast="تعديل بيانات ' + c.role + ' (تجريبي)">تعديل</button></div>';
  }).join("") +
    '<div class="card" style="grid-column:1/-1">' +
    '<h3 class="h3">تحقق من صحة المالك</h3>' +
    '<p class="muted mt-2" style="font-size:var(--fs-sm)">الملكية لازم تكون للعميل الفعلي. دي نفس القاعدة اللي المزوّد بيفرضها: بيانات Migo مرفوضة كمالك رسمي.</p>' +
    '<div class="row wrap-flex mt-3">' +
    '<div class="field grow"><label for="ownerTry">جرب اسم أو بريد</label>' +
    '<input class="input" id="ownerTry" placeholder="Migo AI أو ahmed@example.test" spellcheck="false"></div>' +
    '<button class="btn" type="button" id="ownerCheck" style="align-self:flex-end">تحقق</button>' +
    "</div><p class=\"hint mt-3\" id=\"ownerResult\"></p></div>";

  $("#ownerCheck").addEventListener("click", function () {
    var v = $("#ownerTry").value.trim().toLowerCase();
    var out = $("#ownerResult");
    if (!v) { out.className = "hint"; out.textContent = "اكتب اسم أو بريد الأول."; return; }
    var blocked = RESELLER_TOKENS.some(function (t) { return v.indexOf(t) !== -1; });
    if (blocked) {
      out.className = "hint error";
      out.textContent = "مرفوض: بيانات الموزّع ممنوعة كمالك رسمي. الملكية لازم تكون للعميل الفعلي.";
      toast("المزوّد هيرفض البيانات دي", "danger");
    } else {
      out.className = "hint";
      out.textContent = "مقبول مبدئيًا كمالك (التحقق النهائي عند المزوّد).";
      toast("البيانات مقبولة مبدئيًا", "ok");
    }
  });

  /* -------------------------------------------------------------- تبويب: الأمان */
  function renderSecurity() {
    $("#lockToggle").textContent = STATE.lock ? "مفعّل · افتح القفل" : "متوقف · اقفل النقل";
    $("#dnssecToggle").textContent = STATE.dnssec ? "مفعّل · اقفل" : "متوقف · فعّل";
    $("#lockValue").textContent = STATE.lock ? "مفعّل" : "متوقف";
    $("#dnssecValue").textContent = STATE.dnssec ? "مفعّل" : "متوقف";
    $("#lockPill").textContent = "قفل النقل: " + (STATE.lock ? "مفعّل" : "متوقف");
    $("#lockPill").className = "pill " + (STATE.lock ? "ok" : "warn");
  }
  $("#lockToggle").addEventListener("click", function () {
    STATE.lock = !STATE.lock;
    renderSecurity();
    renderEligibility();
    toast(STATE.lock ? "اتقفل النقل (تجريبي)" : "اتفتح النقل (تجريبي)", STATE.lock ? "ok" : "warn");
  });
  $("#dnssecToggle").addEventListener("click", function () {
    STATE.dnssec = !STATE.dnssec;
    renderSecurity();
    renderEligibility();
    toast(STATE.dnssec ? "اتفعّل DNSSEC (تجريبي)" : "اتقفل DNSSEC (تجريبي)", STATE.dnssec ? "warn" : "ok");
  });

  $("#authToggle").addEventListener("click", function () {
    var shown = $("#authValue").getAttribute("data-shown") === "1";
    var btn = $("#authToggle");
    if (shown) {
      $("#authValue").textContent = "•••• •••• •••• ••••";
      $("#authValue").setAttribute("data-shown", "0");
      btn.textContent = "إظهار";
      $("#authCopy").hidden = true;
      $("#authHint").className = "hint";
      $("#authHint").textContent = "ممنوع تشاركه في مكان عام، وبيتسلّم لصاحب الدومين بس.";
    } else {
      $("#authValue").textContent = STATE.authCode;
      $("#authValue").setAttribute("data-shown", "1");
      btn.textContent = "إخفاء";
      $("#authCopy").hidden = false;
      $("#authHint").className = "hint error";
      $("#authHint").textContent = "الرمز ظاهر دلوقتي: سرّي، وممنوع في رابط عام أو سجل غير محمي.";
    }
  });
  $("#authCopy").addEventListener("click", function () {
    var done = function () { toast("اتنسخ الرمز (تجريبي)", "ok"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(STATE.authCode).then(done, function () { toast("النسخ مش متاح في المتصفح ده", "warn"); });
    } else {
      toast("النسخ مش متاح في المتصفح ده", "warn");
    }
  });

  /* -------------------------------------------------------------- تبويب: النقل */
  function renderEligibility() {
    var anchor = STATE.lastTransferAt || STATE.created;
    var days = Math.floor((TODAY.getTime() - new Date(anchor + "T00:00:00Z").getTime()) / DAY);
    var checks = [
      { ok: days >= 60, label: "مر 60 يوم من " + (STATE.lastTransferAt ? "آخر نقل" : "التسجيل"),
        detail: "المرّ " + days + " يوم" },
      { ok: !STATE.lock, label: "قفل النقل مفتوح", detail: STATE.lock ? "القفل مفعّل حاليًا" : "مفيش قفل" },
      { ok: !STATE.dnssec, label: "DNSSEC مقفول", detail: STATE.dnssec ? "DNSSEC مفعّل" : "مفيش DNSSEC" },
      { ok: STATE.status === "ACTIVE", label: "حالة الدومين نشطة", detail: STATE.statusLabel },
      { ok: Boolean(STATE.authCode), label: "رمز النقل متاح", detail: "متاح لصاحب الدومين" }
    ];
    $("#eligList").innerHTML = checks.map(function (c) {
      return '<li class="row-between">' +
        '<span class="row"><span aria-hidden="true" class="dim">' + (c.ok ? "✓" : "✗") + "</span>" +
        '<span>' + esc(c.label) + "</span></span>" +
        pill(c.ok ? "ok" : "danger", c.ok ? "متحقق" : "مش متحقق") +
        '<span class="dim" style="font-size:var(--fs-xs);min-width:110px;text-align:end">' + esc(c.detail) + "</span></li>";
    }).join("");

    var blocked = checks.filter(function (c) { return !c.ok; });
    var eligible = blocked.length === 0;
    $("#eligResult").innerHTML = eligible
      ? '<div class="row wrap-flex">' + pill("ok", "مؤهّل للنقل") + "</div>" +
        '<p class="muted mt-3" style="font-size:var(--fs-sm)">كل الشروط متحققة. النقل بيبدأ من المزوّد الحالي، وبيحتاج رمز النقل من تبويب الأمان.</p>'
      : '<div class="row wrap-flex">' + pill("danger", "غير مؤهّل") + "</div>" +
        '<p class="muted mt-3" style="font-size:var(--fs-sm)">الأسباب: ' +
        blocked.map(function (c) { return esc(c.label); }).join(" · ") + ".</p>";
    $("#startTransfer").disabled = !eligible;
  }
  $("#startTransfer").addEventListener("click", function () {
    toast("بدأ طلب نقل تجريبي · الحالة: قيد النقل (مش مكتمل)", "warn");
  });

  /* ------------------------------------------------------------ تنقل سريع */
  $$("[data-goto]").forEach(function (b) {
    b.addEventListener("click", function () {
      var tab = document.querySelector('[data-tab="' + b.getAttribute("data-goto") + '"]');
      if (tab) { tab.click(); tab.focus(); }
    });
  });

  /* ------------------------------------------------------------ أول رسم */
  renderNs();
  renderDns();
  renderSecurity();
  renderEligibility();
})();
