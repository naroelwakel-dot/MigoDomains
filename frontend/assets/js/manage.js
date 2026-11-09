/* ==========================================================================
   Migo Domains - إدارة الدومين (صفحة manage.html)
   --------------------------------------------------------------------------
   كل الإجراءات الحقيقية بتتنادى على خدمة المنصة والخدمة هي المرجع
   (حفظ الـNameservers، سجلات DNS، قفل النقل، DNSSEC، تفاصيل الدومين،
   جهات الاتصال، رمز النقل، وأهلية النقل): لو الخدمة رفضت، الصفحة بتقول
   كده ومش بتحفظ حاجة محليًا. الفاضي من غير خدمة = عرض تجريبي معلَّم.
   مفيش أي مفاتيح، ومفيش أي سعر محسوب هنا.

   الفحص المحلي للـNameservers والـDNS **مرآة** لقواعد المزوّد
   (`providers/lib/mock.js`)، ووظيفته رد سريع للمستخدم بس — القرار النهائي
   عند الخدمة/المزوّد دايمًا.
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
  var DEFAULT_NS = ["ns1.migo-dns.test", "ns2.migo-dns.test"];
  /* نفس تحقق المزوّد: IPv4 بمدى 0-255 وبدون أصفار بادئة */
  function isIPv4(v) {
    var p = String(v).split(".");
    if (p.length !== 4) return false;
    return p.every(function (x) { return /^(0|[1-9]\d{0,2})$/.test(x) && Number(x) <= 255; });
  }
  /* نفس قاعدة المزوّد: بيانات الموزّع ممنوعة كمالك رسمي */
  var RESELLER_TOKENS = ["migo", "naroelwakel"];

  /* -------------------------------------------------------- بطاقات النظرة العامة */
  function renderOverview() {
    var expires = new Date(STATE.expires + "T00:00:00Z");
    var daysLeft = Math.ceil((expires.getTime() - TODAY.getTime()) / DAY);
    $("#expiryValue").textContent = fmt(expires);
    $("#daysLeftValue").textContent = daysLeft + " يوم متبقي";
    $("#autoRenewValue").textContent = STATE.autoRenew ? "مفعّل" : "متوقف";
    $("#createdValue").textContent = fmt(new Date(STATE.created + "T00:00:00Z"));
    $("#ownerValue").textContent = STATE.owner;
    $("#statusPill").textContent = STATE.statusLabel;
    $("#providerPill").textContent = STATE.providerConnected ? "متصل" : "غير متصل";
    $("#providerPill").className = "pill " + (STATE.providerConnected ? "ok" : "warn");
  }

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

  /** الخدمة مربوطة وفيه جلسة؟ وإلا سبب واضح للمستخدم. */
  function platformService() {
    if (!window.migoApi || !window.migoApi.isConfigured()) {
      return { ok: false, message: "خدمة المنصة مش مربوطة، فالتغيير مااتبعتش ومش محفوظ." };
    }
    var A = window.MigoAuth;
    if (!A || typeof A.isSignedIn !== "function" || !A.isSignedIn()) {
      return { ok: false, message: "سجّل دخولك الأول عشان التغيير يتبعت للخدمة." };
    }
    return { ok: true, api: window.migoApi };
  }

  function setNsHint(text, isError) {
    var hint = $("#nsHint");
    if (!hint) return;
    hint.className = isError ? "hint error" : "hint";
    hint.textContent = text;
  }

  /* فحص سريع بنفس قواعد المزوّد — القرار النهائي عند الخدمة. */
  function localNsProblem(lines) {
    if (lines.length < 2 || lines.length > 6) return "عدد الـNameservers لازم يكون من 2 لـ6، والعدد الحالي " + lines.length + ".";
    var bad = lines.filter(function (n) { return !HOSTNAME.test(n); });
    if (bad.length) return "اسم خادم غير صحيح: " + bad.join(" · ");
    return null;
  }

  /** بيعرض في الجدول الخوادم اللي **الخدمة** أكّدتها. */
  function applyNs(applied) {
    STATE.nameservers = applied.slice();
    renderNs();
    refreshDns();
  }

  function submitNameservers(lines) {
    var problem = localNsProblem(lines);
    if (problem) { setNsHint(problem, true); return; }

    var svc = platformService();
    if (!svc.ok) { setNsHint(svc.message, true); return; }

    var btn = $("#nsSubmit");
    if (btn) btn.disabled = true;
    setNsHint("جاري الإرسال للخدمة...", false);

    svc.api.setNameservers(STATE.name, lines).then(function (res) {
      if (btn) btn.disabled = false;
      var applied = res && res.nameservers && res.nameservers.length ? res.nameservers.slice() : lines.slice();
      applyNs(applied);
      setNsHint("الخدمة أكّدت التحديث.", false);
      toast("تم تحديث الـNameservers على الخدمة", "ok");
    }).catch(function (err) {
      if (btn) btn.disabled = false;
      var msg = (err && err.message) || "خطأ غير متوقع";
      setNsHint("الخدمة رفضت التغيير: " + msg + (err && err.code ? " (" + err.code + ")" : ""), true);
      toast("الخدمة رفضت التغيير: مفيش حاجة اتحفظت", "danger");
    });
  }

  $("#nsForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var lines = $("#nsInput").value.split("\n").map(function (s) { return s.trim().toLowerCase(); })
      .filter(function (s) { return s !== ""; });
    submitNameservers(lines);
  });

  $("#nsReset").addEventListener("click", function () {
    var input = $("#nsInput");
    if (input) input.value = DEFAULT_NS.join("\n");
    submitNameservers(DEFAULT_NS.slice());
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

  function setDnsHint(text, isError) {
    var hint = $("#dnsHint");
    if (!hint) return;
    hint.className = isError ? "hint error" : "hint";
    hint.textContent = text;
  }

  /* الديمو: سجلات تجريبية + سجلات السلطة من الـNameservers الحالية. */
  function demoRecords() {
    var auth = STATE.nameservers.map(function (ns) {
      return { type: "NS", name: "@", value: ns, ttl: 3600, authority: true };
    });
    var normal = STATE.records
      .filter(function (r) { return !r.authority; })
      .map(function (r) { return { type: r.type, name: r.name, value: r.value, ttl: r.ttl, authority: false }; });
    if (!normal.length) {
      normal = [
        { type: "A", name: "@", value: "192.0.2.10", ttl: 3600, authority: false },
        { type: "CNAME", name: "www", value: STATE.name, ttl: 3600, authority: false },
        { type: "MX", name: "@", value: "mail.example.test", ttl: 3600, authority: false },
        { type: "TXT", name: "@", value: "v=spf1 -all", ttl: 3600, authority: false }
      ];
    }
    return auth.concat(normal);
  }

  /** بيعرض السجلات اللي **الخدمة** رجّعتها، وإلا الديمو. */
  function applyDns(records) {
    STATE.records = (records && records.length ? records : demoRecords()).map(function (r) {
      return { id: r.id || null, type: r.type, name: r.name, value: r.value, ttl: r.ttl, authority: r.authority === true };
    });
    renderDns();
  }

  /** يجيب السجلات من الخدمة لو مربوطة، وإلا يفضل على الديمو. */
  function refreshDns() {
    var svc = platformService();
    if (!svc.ok) { applyDns(demoRecords()); return; }
    svc.api.getDnsRecords(STATE.name).then(function (records) {
      applyDns(records);
    }).catch(function () { applyDns(demoRecords()); });
  }

  /** السجلات العادية بس (سجلات السلطة مش بتتبعت للخدمة). */
  function zoneRecords() {
    return STATE.records.filter(function (r) { return !r.authority; }).map(function (r) {
      return { type: r.type, name: r.name, value: r.value, ttl: r.ttl };
    });
  }

  function submitDns(records, okMessage) {
    var svc = platformService();
    if (!svc.ok) { setDnsHint(svc.message, true); return; }
    setDnsHint("جاري الإرسال للخدمة...", false);
    svc.api.updateDnsRecords(STATE.name, records).then(function (res) {
      applyDns(res && res.records ? res.records : demoRecords());
      setDnsHint("الخدمة أكّدت التحديث.", false);
      toast(okMessage || "تم تحديث سجلات DNS على الخدمة", "ok");
    }).catch(function (err) {
      var msg = (err && err.message) || "خطأ غير متوقع";
      setDnsHint("الخدمة رفضت التغيير: " + msg + (err && err.code ? " (" + err.code + ")" : ""), true);
      toast("الخدمة رفضت التغيير: مفيش حاجة اتحفظت", "danger");
    });
  }

  $("#dnsBody").addEventListener("click", function (e) {
    var b = e.target.closest("[data-del]");
    if (!b) return;
    var i = Number(b.getAttribute("data-del"));
    var rec = STATE.records[i];
    if (!rec || rec.authority) { toast("سجلات السلطة مش بتتحذف من هنا — تتبدّل من تبويب Nameservers", "danger"); return; }
    var kept = STATE.records.filter(function (r, idx) { return idx !== i && !r.authority; }).map(function (r) {
      return { type: r.type, name: r.name, value: r.value, ttl: r.ttl };
    });
    submitDns(kept, "اتشال السجل " + rec.type + " من الخدمة");
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
    var next = zoneRecords();
    next.push({ type: type, name: name, value: value, ttl: ttl });
    submitDns(next, "اتضاف السجل " + type + " على الخدمة");
    $("#dnsValue").value = "";
  });

  /* ------------------------------------------------------------ تبويب: جهات الاتصال */
  var DEMO_CONTACTS = [
    { role: "Registrant", note: "صاحب الدومين", pill: "accent", name: "أحمد العميل", email: "ahmed@example.test" },
    { role: "Admin", note: "الإدارة التقنية", pill: "info", name: "أحمد العميل", email: "ahmed@example.test" },
    { role: "Tech", note: "الدعم الفني", pill: "info", name: "أحمد العميل", email: "ahmed@example.test" },
    { role: "Billing", note: "الفوترة", pill: "info", name: "أحمد العميل", email: "ahmed@example.test" }
  ];
  var CONTACT_ROLES = [
    { key: "registrant", role: "Registrant", note: "صاحب الدومين", pill: "accent" },
    { key: "admin", role: "Admin", note: "الإدارة التقنية", pill: "info" },
    { key: "tech", role: "Tech", note: "الدعم الفني", pill: "info" },
    { key: "billing", role: "Billing", note: "الفوترة", pill: "info" }
  ];
  var OWNER_CARD_HTML =
    '<div class="card" style="grid-column:1/-1">' +
    '<h3 class="h3">تحقق من صحة المالك</h3>' +
    '<p class="muted mt-2" style="font-size:var(--fs-sm)">الملكية لازم تكون للعميل الفعلي. دي نفس القاعدة اللي المزوّد بيفرضها: بيانات Migo مرفوضة كمالك رسمي.</p>' +
    '<div class="row wrap-flex mt-3">' +
    '<div class="field grow"><label for="ownerTry">جرب اسم أو بريد</label>' +
    '<input class="input" id="ownerTry" placeholder="Migo AI أو ahmed@example.test" spellcheck="false"></div>' +
    '<button class="btn" type="button" id="ownerCheck" style="align-self:flex-end">تحقق</button>' +
    "</div><p class=\"hint mt-3\" id=\"ownerResult\"></p></div>";

  /** جهات الاتصال من رد الخدمة لو فيها أي جهة؛ وإلا `null` (يعني الديمو). */
  function contactsFromService(contacts) {
    if (!contacts) return null;
    var any = false;
    var rows = CONTACT_ROLES.map(function (r) {
      var c = contacts[r.key] || null;
      if (c) any = true;
      return {
        role: r.role,
        note: r.note,
        pill: r.pill,
        name: (c && c.name) || "-",
        email: (c && c.email) || "-"
      };
    });
    return any ? rows : null;
  }

  function renderContacts(rows) {
    var list = rows || DEMO_CONTACTS;
    $("#contactsGrid").innerHTML = list.map(function (c) {
      return '<div class="card"><div class="row-between"><h3 class="h3">' + c.role + "</h3>" +
        pill(c.pill || "info", c.note) + "</div>" +
        '<div class="mt-3 row-between"><span class="muted">الاسم</span><span>' + esc(c.name) + "</span></div>" +
        '<div class="mt-2 row-between"><span class="muted">البريد</span><span class="mono">' + esc(c.email) + "</span></div>" +
        '<button class="btn btn-sm mt-4" type="button" data-toast="تعديل بيانات ' + c.role + ' (تجريبي)">تعديل</button></div>';
    }).join("") + OWNER_CARD_HTML;
    bindOwnerCheck();
  }

  function checkOwner() {
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
  }

  /* الزرار بيتبني من جديد مع كل رسم، فبنربط مرة واحدة للنسخة الحالية. */
  function bindOwnerCheck() {
    var btn = $("#ownerCheck");
    if (!btn || btn.__ownerBound) return;
    btn.__ownerBound = true;
    btn.addEventListener("click", checkOwner);
  }

  /* -------------------------------------------------------------- تبويب: الأمان */
  function renderSecurity() {
    $("#lockToggle").textContent = STATE.lock ? "مفعّل · افتح القفل" : "متوقف · اقفل النقل";
    $("#dnssecToggle").textContent = STATE.dnssec ? "مفعّل · اقفل" : "متوقف · فعّل";
    $("#lockValue").textContent = STATE.lock ? "مفعّل" : "متوقف";
    $("#dnssecValue").textContent = STATE.dnssec ? "مفعّل" : "متوقف";
    $("#lockPill").textContent = "قفل النقل: " + (STATE.lock ? "مفعّل" : "متوقف");
    $("#lockPill").className = "pill " + (STATE.lock ? "ok" : "warn");
  }

  function setSecurityHint(text, isError) {
    var hint = $("#securityHint");
    if (!hint) return;
    hint.className = isError ? "hint error" : "hint";
    hint.textContent = text;
  }

  /** القفل وDNSSEC بيتغيّروا على الخدمة، والصفحة بتعكس رد الخدمة بس. */
  function toggleSecurity(kind) {
    var next = kind === "lock" ? !STATE.lock : !STATE.dnssec;
    var svc = platformService();
    if (!svc.ok) { setSecurityHint(svc.message, true); return; }
    setSecurityHint("جاري الإرسال للخدمة...", false);
    var call = kind === "lock" ? svc.api.setTransferLock(STATE.name, next) : svc.api.setDnssec(STATE.name, next);
    call.then(function (res) {
      if (kind === "lock") STATE.lock = res && typeof res.locked === "boolean" ? res.locked : next;
      else STATE.dnssec = res && typeof res.dnssec === "boolean" ? res.dnssec : next;
      renderSecurity();
      refreshEligibility();
      setSecurityHint("الخدمة أكّدت التحديث.", false);
      toast(kind === "lock"
        ? (STATE.lock ? "اتقفل النقل على الخدمة" : "اتفتح النقل على الخدمة")
        : (STATE.dnssec ? "اتفعّل DNSSEC على الخدمة" : "اتقفل DNSSEC على الخدمة"), "ok");
    }).catch(function (err) {
      setSecurityHint("الخدمة رفضت التغيير: " + ((err && err.message) || "خطأ غير متوقع") + (err && err.code ? " (" + err.code + ")" : ""), true);
      toast("الخدمة رفضت التغيير: مفيش حاجة اتتحفظت", "danger");
    });
  }

  $("#lockToggle").addEventListener("click", function () { toggleSecurity("lock"); });
  $("#dnssecToggle").addEventListener("click", function () { toggleSecurity("dnssec"); });

  /* رمز النقل سرّي: بيتطلب من الخدمة عند لحظة العرض، ومش بيتخزّن في الحالة. */
  var AUTH_HIDDEN = "•••• •••• •••• ••••";
  var revealedAuthCode = null;

  function setAuthHint(text, isError) {
    var hint = $("#authHint");
    if (!hint) return;
    hint.className = isError ? "hint error" : "hint";
    hint.textContent = text;
  }

  function hideAuthCode() {
    revealedAuthCode = null;
    $("#authValue").textContent = AUTH_HIDDEN;
    $("#authValue").setAttribute("data-shown", "0");
    $("#authToggle").textContent = "إظهار";
    $("#authCopy").hidden = true;
    setAuthHint("ممنوع تشاركه في مكان عام، وبيتسلّم لصاحب الدومين بس.", false);
  }

  function showAuthCode(code, warning) {
    revealedAuthCode = code;
    $("#authValue").textContent = code;
    $("#authValue").setAttribute("data-shown", "1");
    $("#authToggle").textContent = "إخفاء";
    $("#authCopy").hidden = false;
    setAuthHint(warning || "الرمز ظاهر دلوقتي: سرّي، وممنوع في رابط عام أو سجل غير محمي.", true);
  }

  $("#authToggle").addEventListener("click", function () {
    if ($("#authValue").getAttribute("data-shown") === "1") { hideAuthCode(); return; }
    var svc = platformService();
    if (!svc.ok) { setAuthHint(svc.message, true); return; }
    setAuthHint("جاري طلب الرمز من الخدمة...", false);
    svc.api.getAuthCode(STATE.name).then(function (res) {
      if (!res || !res.authCode) { setAuthHint("الخدمة ماردّتش رمز نقل للدومين ده.", true); return; }
      showAuthCode(res.authCode, res.warning);
      toast("الخدمة رجّعت رمز النقل", "ok");
    }).catch(function (err) {
      setAuthHint("الخدمة رفضت طلب الرمز: " + ((err && err.message) || "خطأ غير متوقع") + (err && err.code ? " (" + err.code + ")" : ""), true);
      toast("الخدمة رفضت طلب رمز النقل", "danger");
    });
  });

  $("#authCopy").addEventListener("click", function () {
    if (!revealedAuthCode) { toast("اطلب الرمز من الخدمة الأول.", "warn"); return; }
    var done = function () { toast("اتنسخ الرمز", "ok"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(revealedAuthCode).then(done, function () { toast("النسخ مش متاح في المتصفح ده", "warn"); });
    } else {
      toast("النسخ مش متاح في المتصفح ده", "warn");
    }
  });


  /* -------------------------------------------------------------- تبويب: النقل */
  /* فحص محلي للعرض التجريبي بس — القرار النهائي بييجي من الخدمة. */
  function localEligibilityChecks() {
    var anchor = STATE.lastTransferAt || STATE.created;
    var days = Math.floor((TODAY.getTime() - new Date(anchor + "T00:00:00Z").getTime()) / DAY);
    return [
      { ok: days >= 60, label: "مر 60 يوم من " + (STATE.lastTransferAt ? "آخر نقل" : "التسجيل"),
        detail: "المرّ " + days + " يوم" },
      { ok: !STATE.lock, label: "قفل النقل مفتوح", detail: STATE.lock ? "القفل مفعّل حاليًا" : "مفيش قفل" },
      { ok: !STATE.dnssec, label: "DNSSEC مقفول", detail: STATE.dnssec ? "DNSSEC مفعّل" : "مفيش DNSSEC" },
      { ok: STATE.status === "ACTIVE", label: "حالة الدومين نشطة", detail: STATE.statusLabel },
      { ok: true, label: "رمز النقل بيتطلب من تبويب الأمان", detail: "عند الطلب" }
    ];
  }

  /** serviceResult: رد الخدمة (eligible + reasons) لو متاح، وإلا الديمو. */
  function renderEligibility(serviceResult) {
    var checks = localEligibilityChecks();
    var eligible = checks.every(function (c) { return c.ok; });

    if (serviceResult && typeof serviceResult.eligible === "boolean") {
      eligible = serviceResult.eligible;
      var reasons = Array.isArray(serviceResult.reasons) ? serviceResult.reasons : [];
      checks = reasons.map(function (r) {
        return { ok: false, label: r.message || "شرط مش متحقق", detail: r.code || "" };
      });
      if (eligible) checks = [{ ok: true, label: "الخدمة أكدّت تحقق كل شروط النقل", detail: "" }];
    }

    $("#eligList").innerHTML = checks.map(function (c) {
      return '<li class="row-between">' +
        '<span class="row"><span aria-hidden="true" class="dim">' + (c.ok ? "✓" : "✗") + "</span>" +
        '<span>' + esc(c.label) + "</span></span>" +
        pill(c.ok ? "ok" : "danger", c.ok ? "متحقق" : "مش متحقق") +
        '<span class="dim" style="font-size:var(--fs-xs);min-width:110px;text-align:end">' + esc(c.detail) + "</span></li>";
    }).join("");

    var blocked = checks.filter(function (c) { return !c.ok; });
    $("#eligResult").innerHTML = eligible
      ? '<div class="row wrap-flex">' + pill("ok", "مؤهّل للنقل") + "</div>" +
        '<p class="muted mt-3" style="font-size:var(--fs-sm)">كل الشروط متحققة. النقل بيبدأ من المزوّد الحالي، وبيحتاج رمز النقل من تبويب الأمان.</p>'
      : '<div class="row wrap-flex">' + pill("danger", "غير مؤهّل") + "</div>" +
        '<p class="muted mt-3" style="font-size:var(--fs-sm)">الأسباب: ' +
        blocked.map(function (c) { return esc(c.label); }).join(" · ") + ".</p>";
    $("#startTransfer").disabled = !eligible;
  }

  /** الأهلية بتتحسب في الخدمة؛ الديمو بديل عرض بس. */
  function refreshEligibility() {
    var svc = platformService();
    if (!svc.ok) { renderEligibility(null); return; }
    svc.api.getTransferEligibility(STATE.name).then(function (r) {
      renderEligibility(r);
    }).catch(function () { renderEligibility(null); });
  }
  $("#startTransfer").addEventListener("click", function () {
    toast("بدأ طلب نقل تجريبي · الحالة: قيد النقل (مش مكتمل)", "warn");
  });

  /* ------------------------------------------ بيانات الدومين من الخدمة */
  var STATUS_LABELS = {
    ACTIVE: "نشط",
    TRANSFER_PENDING: "قيد النقل",
    EXPIRED: "منتهي",
    REDEMPTION_PERIOD: "فترة الاسترداد",
    PENDING_DELETE: "قيد الحذف"
  };

  /** يقرأ تفاصيل الدومين من الخدمة ويملّي الصفحة بيها. */
  function loadDomain() {
    var svc = platformService();
    if (!svc.ok) return;
    svc.api.getDomain(STATE.name).then(function (d) {
      if (!d) return;
      if (d.expiresAt) STATE.expires = String(d.expiresAt).slice(0, 10);
      if (d.registeredAt) STATE.created = String(d.registeredAt).slice(0, 10);
      if (d.status) { STATE.status = d.status; STATE.statusLabel = STATUS_LABELS[d.status] || d.status; }
      if (d.registrant && d.registrant.email) STATE.owner = d.registrant.email;
      if (typeof d.transferLock === "boolean") STATE.lock = d.transferLock;
      if (typeof d.dnssec === "boolean") STATE.dnssec = d.dnssec;
      if (Array.isArray(d.nameservers) && d.nameservers.length) {
        STATE.nameservers = d.nameservers.slice();
        renderNs();
      }
      var contactRows = contactsFromService(d.contacts);
      if (contactRows) renderContacts(contactRows);
      renderOverview();
      renderSecurity();
      refreshEligibility();
    }).catch(function () { /* يفضل على العرض التجريبي */ });
  }

  /* ------------------------------------------------------------ تنقل سريع */
  $$("[data-goto]").forEach(function (b) {
    b.addEventListener("click", function () {
      var tab = document.querySelector('[data-tab="' + b.getAttribute("data-goto") + '"]');
      if (tab) { tab.click(); tab.focus(); }
    });
  });

  /* ------------------------------------------------------------ أول رسم */
  renderOverview();
  renderNs();
  refreshDns();
  renderSecurity();
  renderContacts();
  hideAuthCode();
  renderEligibility(null);
  loadDomain();
})();
