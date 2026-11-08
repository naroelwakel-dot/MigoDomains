/* ==========================================================================
   Migo Domains - لوحة الإدارة (صفحة admin.html)
   --------------------------------------------------------------------------
   بيانات تجريبية بالكامل (من admin-data.js). مفيش أي اتصال بقاعدة بيانات
   ولا بأي مزوّد، ومفيش أي مفاتيح. مزوّد التسجيل معروض «غير متصل».

   تكلفة المزوّد والهامش **بيظهروا هنا فقط** (قواعد الفصل في
   docs/DESIGN_SYSTEM.md) وممنوع ظهورهم في واجهة العميل.

   حسابات الهامش تحت مرآة لـ pricing/lib/{decimal,tiers,margin}.js بنفس
   أرقام الميكرو-دولار (BigInt) عشان تدي نفس النتائج بالحرف.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ======================================================================
     محرك الهامش (مرآة لمحرك التسعير المعتمد)
     ====================================================================== */
  var MICRO = 1000000n;

  function toMicros(value) {
    var s;
    if (typeof value === "number") { if (!isFinite(value)) return null; s = String(value); }
    else if (typeof value === "string") { s = value.trim(); }
    else { return null; }
    if (s === "") return null;
    var m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(s);
    if (!m || (m[2] === "" && (m[3] === undefined || m[3] === ""))) return null;
    var sign = m[1] === "-" ? -1n : 1n;
    var frac = m[3] || "";
    var kept = (frac + "000000").slice(0, 6);
    var rest = frac.slice(6);
    var v = BigInt(m[2] || "0") * MICRO + BigInt(kept);
    if (rest && rest.charCodeAt(0) - 48 >= 5) v += 1n;
    return sign * v;
  }

  function divRoundHalfUp(n, d) {
    if (d === 0n) return null;
    var neg = (n < 0n) !== (d < 0n);
    var a = n < 0n ? -n : n, b = d < 0n ? -d : d;
    var q = a / b;
    if ((a % b) * 2n >= b) q += 1n;
    return neg ? -q : q;
  }

  function percentOf(micros, percent) {
    var p = toMicros(percent);
    return divRoundHalfUp(micros * p, 100n * MICRO);
  }

  /* نصف-لأعلى لخانتين عشريتين ثم صياغة نص بالخانتين */
  function money2(micros) {
    var f = 10000n, neg = micros < 0n, v = neg ? -micros : micros;
    var q = v / f; if ((v % f) * 2n >= f) q += 1n;
    var out = q * f, o = neg ? -out : out;
    var av = o < 0n ? -o : o;
    var int = av / MICRO, frac = (av % MICRO) / f;
    return (o < 0n ? "-" : "") + int.toString() + "." + frac.toString().padStart(2, "0");
  }

  /* نص عشري بلا أصفار زايدة (بدقة الميكرو) */
  function dec(micros) {
    var neg = micros < 0n, v = neg ? -micros : micros;
    var int = v / MICRO;
    var frac = (v % MICRO).toString().padStart(6, "0").replace(/0+$/, "");
    return (neg ? "-" : "") + int.toString() + (frac ? "." + frac : "");
  }

  /* الشريحة المطبَّقة: مرآة لـ pricing/lib/tiers.js */
  function pickTier(costMicros) {
    if (costMicros < toMicros("8")) return { label: "أقل من 8", rule: "+2.50 ثابت", flat: "2.50" };
    if (costMicros < toMicros("15")) return { label: "من 8 إلى أقل من 15", rule: "+3.00 ثابت", flat: "3.00" };
    if (costMicros <= toMicros("30")) return { label: "من 15 إلى 30", rule: "+4.00 ثابت", flat: "4.00" };
    return { label: "أكثر من 30", rule: "15% بحد أدنى 4.00", percent: "15", floor: "4.00" };
  }

  /* سعر من التكلفة: يرجع { ok, reason?, tier?, marginMicros?, saleMicros? } */
  function price(costMicros) {
    if (costMicros === null || costMicros === undefined) return { ok: false, reason: "INVALID" };
    if (costMicros < 0n) return { ok: false, reason: "NEGATIVE" };
    if (costMicros === 0n) return { ok: false, reason: "ZERO" };
    var t = pickTier(costMicros);
    var margin;
    if (t.percent) {
      margin = percentOf(costMicros, t.percent);
      var fl = toMicros(t.floor);
      if (margin < fl) margin = fl;
    } else {
      margin = toMicros(t.flat);
    }
    return { ok: true, tier: t, marginMicros: margin, saleMicros: costMicros + margin };
  }

  /* ======================================================================
     أدوات عرض
     ====================================================================== */
  /* مكشوفة للاختبار عشان تتقارن بمحرك التسعير الحقيقي (pricing/lib) */
  window.migoAdminCalc = { toMicros: toMicros, price: price, pickTier: pickTier, money2: money2, dec: dec };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pill(s, l) { return '<span class="pill ' + s + '">' + esc(l) + "</span>"; }
  function set(sel, html) { var el = $(sel); if (el) el.innerHTML = html; }
  function row(d) { return "<tr>" + d.map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>"; }
  function mono(v) { return '<span class="mono">' + esc(v) + "</span>"; }
  function kv(dl) {
    return "<dl class=\"kv\">" + dl.map(function (p) {
      return "<dt>" + esc(p[0]) + "</dt><dd>" + p[1] + "</dd>";
    }).join("") + "</dl>";
  }

  var TODAY = new Date("2026-11-08T00:00:00Z");
  function daysLeft(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    var d = new Date(iso + "T00:00:00Z");
    return Math.round((d - TODAY) / 86400000);
  }

  var STATUSES = [
    { key: "", label: "الكل" },
    { key: "ok", label: "نشط / مكتمل" },
    { key: "warn", label: "قرب يخلص / معلّق" },
    { key: "info", label: "تحت الإجراء" },
    { key: "danger", label: "فشل" }
  ];

  function chips(hostSel, data, current, onPick) {
    var groups = STATUSES.map(function (s) {
      var n = s.key ? data.filter(function (x) { return x.status === s.key; }).length : data.length;
      return '<button class="chip" type="button" data-chip="' + s.key + '" aria-pressed="' +
        (s.key === current ? "true" : "false") + '">' + esc(s.label) + ' <span class="n">' + n + "</span></button>";
    }).join("");
    var host = $(hostSel);
    if (!host) return;
    host.innerHTML = groups;
    $$("[data-chip]", host).forEach(function (b) {
      b.addEventListener("click", function () { onPick(b.getAttribute("data-chip")); });
    });
  }

  /* ======================================================================
     تبويبات الأقسام
     ====================================================================== */
  var links = $$("[data-apanel]");
  var panels = $$("[data-apage]");
  function show(name) {
    links.forEach(function (a) { a.setAttribute("aria-current", a.getAttribute("data-apanel") === name ? "true" : "false"); });
    panels.forEach(function (p) { p.hidden = p.getAttribute("data-apage") !== name; });
    var side = $("#adminNav"); if (side) side.classList.remove("open");
  }
  links.forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); show(a.getAttribute("data-apanel")); }); });
  if (links[0]) show(links[0].getAttribute("data-apanel"));

  /* ======================================================================
     Drawer التفاصيل (بيستخدم .drawer + .scrim من app.js)
     ====================================================================== */
  function openDetail(title, html) {
    set("#detailTitle", esc(title));
    set("#detailBody", html);
    var dr = $("#detailDrawer"); if (dr) dr.classList.add("open");
    var sc = $(".scrim"); if (sc) sc.classList.add("open");
    document.body.style.overflow = "hidden";
    var first = $("#detailClose"); if (first) first.focus();
  }
  window.migoAdminDetail = openDetail;

  /* ======================================================================
     1) نظرة عامة
     ====================================================================== */
  var D = window.ADMIN_DOMAINS, O = window.ADMIN_ORDERS, C = window.ADMIN_CUSTOMERS, A = window.ADMIN_AUDIT;
  var REV = window.ADMIN_REVENUE;

  var expiring = D.filter(function (d) { return d.status === "warn"; }).length;
  var failing = D.filter(function (d) { return d.status === "danger"; }).length;
  var failedOrders = O.filter(function (o) { return o.status === "danger"; }).length;
  var last = REV[REV.length - 1];

  var KPI = [
    { k: "دومينات نشطة", v: String(D.length), d: "من إجمالي " + D.length + " دومين", cls: "" },
    { k: "طلبات هذا الشهر", v: String(O.length), d: failedOrders + " فاشل", cls: failedOrders ? "down" : "" },
    { k: "إيراد (تجريبي)", v: "$" + last.revenue, d: "↑ عن الشهر اللي قبله", cls: "up" },
    { k: "هامش (تجريبي)", v: "$" + last.margin, d: "هامش داخلي - مش للعميل", cls: "" },
    { k: "قرب تنتهي", v: String(expiring + failing), d: failing + " فشل تجديد", cls: expiring + failing ? "down" : "" }
  ];
  window.ADMIN_KPI = KPI;

  set("#kpis", KPI.map(function (k) {
    return '<div class="card card-tight kpi"><div class="kpi-k">' + esc(k.k) + "</div>" +
      '<div class="kpi-v">' + esc(k.v) + "</div>" +
      '<div class="kpi-d ' + k.cls + '">' + esc(k.d) + "</div></div>";
  }).join(""));

  set("#admRevenue", REV.map(function (r) {
    var pct = Math.min(100, Math.round((Number(r.margin) / Number(r.revenue)) * 100));
    return row([esc(r.month), mono("$" + r.revenue), mono("$" + r.margin),
      '<div class="mini-bar" title="' + pct + '%"><i style="width:' + pct + '%"></i></div>']);
  }).join(""));

  var attention = [];
  D.filter(function (d) { return d.status === "danger"; }).forEach(function (d) {
    attention.push({ cls: "danger", txt: "فشل تجديد " + d.name + " (العميل " + d.cust + ")" });
  });
  D.filter(function (d) { return d.status === "warn"; }).forEach(function (d) {
    attention.push({ cls: "", txt: "قرب ينتهي: " + d.name + " - " + d.expires });
  });
  O.filter(function (o) { return o.status === "danger"; }).forEach(function (o) {
    attention.push({ cls: "danger", txt: "طلب فاشل " + o.id + " - " + o.reason });
  });
  attention.push({ cls: "", txt: "مزوّد التسجيل غير متصل - مفيش تسجيل حقيقي ممكن" });
  set("#admAttention", attention.slice(0, 6).map(function (a) {
    return '<li class="' + a.cls + '"><span class="dotmark"></span><span class="grow">' + esc(a.txt) + "</span></li>";
  }).join(""));

  /* ======================================================================
     2) الدومينات
     ====================================================================== */
  var dFilter = "", dQuery = "";
  function pickDom(k) { dFilter = k; renderDomains(); }
  function renderDomains() {
    chips("#domChips", D, dFilter, pickDom);
    var list = D.filter(function (d) {
      var okF = !dFilter || d.status === dFilter;
      var okQ = !dQuery || (d.name + " " + d.cust).toLowerCase().indexOf(dQuery) !== -1;
      return okF && okQ;
    });
    set("#admDomains", list.length ? list.map(function (d) {
      return row([mono(d.name), mono(d.cust), pill(d.status, d.label), esc(String(d.expires)),
        mono(String(daysLeft(d.expires) === null ? "-" : daysLeft(d.expires) + " يوم")),
        '<button class="btn btn-sm" type="button" data-dom="' + esc(d.name) + '">تفاصيل</button>']);
    }).join("") : '<tr><td colspan="6" class="dim">مفيش دومين مطابق للفلتر.</td></tr>');
    set("#domCount", list.length + " من " + D.length);
    $$("[data-dom]").forEach(function (b) {
      b.addEventListener("click", function () { domainDetail(b.getAttribute("data-dom")); });
    });
  }
  chips("#domChips", D, dFilter, pickDom);
  (function () {
    var inp = $("#domSearch");
    if (inp) inp.addEventListener("input", function () { dQuery = inp.value.trim().toLowerCase(); renderDomains(); });
  })();
  renderDomains();

  function domainDetail(name) {
    var d = D.filter(function (x) { return x.name === name; })[0];
    if (!d) return;
    var p = price(toMicros(d.cost));
    var dl = [
      ["الدومين", mono(d.name)],
      ["الحالة", pill(d.status, d.label)],
      ["العميل", mono(d.cust)],
      ["تاريخ الانتهاء", esc(String(d.expires))],
      ["المتبقي", mono(daysLeft(d.expires) === null ? "-" : daysLeft(d.expires) + " يوم")],
      ["التجديد التلقائي", d.auto ? pill("ok", "مفعّل") : pill("warn", "متوقف")],
      ["عدد الـNameservers", mono(String(d.ns))]
    ];
    var money = "<div class=\"card dz mt-4\"><strong style=\"font-size:var(--fs-sm)\">أرقام داخلية (مش للعميل)</strong><div class=\"mt-3\">" +
      kv([
        ["تكلفة المزوّد", mono("$" + d.cost)],
        ["الشريحة المطبَّقة", esc(p.tier ? p.tier.label : "-")],
        ["الهامش", mono("$" + (p.ok ? dec(p.marginMicros) : "-"))],
        ["سعر البيع USD", mono("$" + (p.ok ? money2(p.saleMicros) : "-"))]
      ]) + "</div><p class=\"hint mt-2\">القيم دي بتظهر في لوحة الإدارة فقط.</p></div>";
    openDetail(d.name, kv(dl) + money +
      '<div class="row wrap-flex mt-4"><button class="btn btn-sm" data-toast="تجديد ' + esc(d.name) + ' (تجريبي)" type="button">تجديد تجريبي</button>' +
      '<button class="btn btn-ghost btn-sm" data-toast="إيقاف/تشغيل التجديد (تجريبي)" type="button">تبديل التجديد</button></div>');
  }

  /* ======================================================================
     3) الطلبات
     ====================================================================== */
  var oFilter = "";
  function pickOrd(k) { oFilter = k; renderOrders(); }
  function renderOrders() {
    chips("#ordChips", O, oFilter, pickOrd);
    var list = O.filter(function (o) { return !oFilter || o.status === oFilter; });
    set("#admOrders", list.length ? list.map(function (o) {
      return row([mono(o.id), esc(o.date), mono(o.cust), mono(o.item), esc(o.op),
        mono("$" + o.amount), pill(o.status, o.label),
        '<button class="btn btn-sm" type="button" data-ord="' + esc(o.id) + '">تفاصيل</button>']);
    }).join("") : '<tr><td colspan="8" class="dim">مفيش طلب مطابق للفلتر.</td></tr>');
    set("#ordCount", list.length + " من " + O.length);
    $$("[data-ord]").forEach(function (b) {
      b.addEventListener("click", function () { orderDetail(b.getAttribute("data-ord")); });
    });
  }
  renderOrders();

  function orderDetail(id) {
    var o = O.filter(function (x) { return x.id === id; })[0];
    if (!o) return;
    var dl = [
      ["رقم الطلب", mono(o.id)], ["التاريخ", esc(o.date)], ["العميل", mono(o.cust)],
      ["العنصر", mono(o.item)], ["العملية", esc(o.op)], ["الإجمالي", mono("$" + o.amount)],
      ["الحالة", pill(o.status, o.label)]
    ];
    if (o.reason) dl.push(["سبب الفشل", esc(o.reason)]);
    openDetail(o.id, kv(dl) +
      '<div class="row wrap-flex mt-4"><button class="btn btn-sm" data-toast="إعادة محاولة ' + esc(o.id) + ' (تجريبي)" type="button">إعادة المحاولة</button>' +
      '<button class="btn btn-ghost btn-sm" data-toast="تحويل لمراجعة يدوية (تجريبي)" type="button">مراجعة يدوية</button></div>' +
      '<p class="hint mt-3">الطلب ده تجريبي؛ مفيش أي عملية دفع حقيقية ولا تسجيل حقيقي.</p>');
  }

  /* ======================================================================
     4) العملاء
     ====================================================================== */
  var cQuery = "";
  function renderCustomers() {
    var list = C.filter(function (c) { return !cQuery || c.email.toLowerCase().indexOf(cQuery) !== -1; });
    set("#admCustomers", list.length ? list.map(function (c) {
      return row([mono(c.email), mono(String(c.domains)), mono(String(c.orders)), esc(c.since),
        mono("$" + c.spent),
        '<button class="btn btn-sm" type="button" data-cust="' + esc(c.email) + '">تفاصيل</button>']);
    }).join("") : '<tr><td colspan="6" class="dim">مفيش عميل مطابق.</td></tr>');
    $$("[data-cust]").forEach(function (b) {
      b.addEventListener("click", function () { customerDetail(b.getAttribute("data-cust")); });
    });
  }
  (function () {
    var inp = $("#custSearch");
    if (inp) inp.addEventListener("input", function () { cQuery = inp.value.trim().toLowerCase(); renderCustomers(); });
  })();
  renderCustomers();

  function customerDetail(email) {
    var c = C.filter(function (x) { return x.email === email; })[0];
    if (!c) return;
    var own = D.filter(function (d) { return d.cust === email; });
    var orders = O.filter(function (o) { return o.cust === email; });
    var list = own.length ? "<ul class=\"attention\">" + own.map(function (d) {
      return "<li><span class=\"grow\">" + mono(d.name) + "</span>" + pill(d.status, d.label) + "</li>";
    }).join("") + "</ul>" : '<p class="dim">مفيش دومينات مسجّلة.</p>';
    var ordList = orders.length ? "<ul class=\"attention\">" + orders.map(function (o) {
      return "<li><span class=\"grow\">" + mono(o.id) + " · " + esc(o.item) + "</span>" + pill(o.status, o.label) + "</li>";
    }).join("") + "</ul>" : '<p class="dim">مفيش طلبات.</p>';
    openDetail(c.email, kv([
      ["البريد", mono(c.email)], ["عدد الدومينات", mono(String(c.domains))],
      ["عدد الطلبات", mono(String(c.orders))], ["عميل من", esc(c.since)],
      ["إجمالي المدفوع", mono("$" + c.spent)]
    ]) + '<h4 class="mt-4">الدومينات</h4>' + list + '<h4 class="mt-4">الطلبات</h4>' + ordList);
  }

  /* ======================================================================
     5) التسعير + الحاسبة
     ====================================================================== */
  set("#admPricing", window.ADMIN_TIERS.map(function (t) {
    return row([esc(t.range), esc(t.rule)]);
  }).join(""));

  (function () {
    var inp = $("#calcCost"), fx = $("#calcFx");
    var host = $("#calcOut");
    function run() {
      if (!host) return;
      var raw = inp ? inp.value.trim() : "";
      if (raw === "") { host.innerHTML = '<p class="dim">اكتب تكلفة المزوّد بالدولار لعرض الهامش وسعر البيع.</p>'; return; }
      var micros = toMicros(raw);
      var p = price(micros);
      if (!p.ok) {
        var msg = p.reason === "ZERO" ? "التكلفة صفر بدون قرار تسعير صريح (قرار P3 معلّق)، وممنوع اختلاق هامش."
          : p.reason === "NEGATIVE" ? "التكلفة لا تكون سالبة."
          : "صيغة رقمية غير صحيحة.";
        host.innerHTML = '<p class="pill danger">' + esc(msg) + "</p>";
        return;
      }
      var fxv = fx ? fx.value.trim() : "";
      var out = [
        ["الشريحة المطبَّقة", esc(p.tier.label + " (" + p.tier.rule + ")")],
        ["الهامش", mono("$" + dec(p.marginMicros))],
        ["سعر البيع USD", mono("$" + money2(p.saleMicros))]
      ];
      if (fxv !== "") {
        var f = toMicros(fxv);
        if (f && f > 0n) {
          var egp = divRoundHalfUp(p.saleMicros * f, MICRO);
          out.push(["سعر البيع EGP (تجريبي)", mono(money2(egp) + " ج.م")]);
        } else {
          out.push(["سعر البيع EGP", '<span class="dim">سعر صرف غير صحيح</span>']);
        }
      }
      host.innerHTML = out.map(function (x) {
        return '<div class="card"><div class="k">' + x[0] + '</div><div class="v">' + x[1] + "</div></div>";
      }).join("");
    }
    if (inp) inp.addEventListener("input", run);
    if (fx) fx.addEventListener("input", run);
    run();
  })();

  /* ======================================================================
     6) المزوّد / Sandbox
     ====================================================================== */
  set("#admCaps", window.ADMIN_CAPABILITIES.map(function (c) {
    return '<div class="cap"><span>' + esc(c.label) + '</span><span class="mono">' + esc(c.key) + "</span></div>";
  }).join(""));

  /* ======================================================================
     7) السجلات
     ====================================================================== */
  var aFilter = "", aQuery = "";
  function pickAudit(k) { aFilter = k; renderAudit(); }
  function renderAudit() {
    chips("#auditChips", A, aFilter, pickAudit);
    var list = A.filter(function (a) {
      var okF = !aFilter || a.result === aFilter;
      var okQ = !aQuery || (a.actor + " " + a.op + " " + a.target).toLowerCase().indexOf(aQuery) !== -1;
      return okF && okQ;
    });
    set("#admAudit", list.length ? list.map(function (a) {
      return row([mono(a.time), esc(a.actor), esc(a.op), mono(a.target),
        pill(a.result, a.result === "ok" ? "نجح" : a.result === "warn" ? "تحذير" : "فشل")]);
    }).join("") : '<tr><td colspan="5" class="dim">مفيش سجل مطابق.</td></tr>');
    set("#auditCount", list.length + " من " + A.length);
  }
  (function () {
    var inp = $("#auditSearch");
    if (inp) inp.addEventListener("input", function () { aQuery = inp.value.trim().toLowerCase(); renderAudit(); });
  })();
  renderAudit();
})();
