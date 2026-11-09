/* ==========================================================================
   Migo Domains - لوحة الإدارة (صفحة admin.html)
   --------------------------------------------------------------------------
   بيانات العرض تجريبية (من admin-data.js). مفيش أي اتصال بقاعدة بيانات
   ولا بأي مزوّد، ومفيش أي مفاتيح. مزوّد التسجيل معروض «غير متصل».

   تكلفة المزوّد والهامش **بيظهروا هنا فقط** (قواعد الفصل في
   docs/DESIGN_SYSTEM.md) وممنوع ظهورهم في واجهة العميل.

   **محرك التسعير مكانه الخدمة، مش المتصفح.** الهامش وسعر البيع بيتحسبوا
   في `POST /admin/price-preview` بمحرك التسعير المعتمد نفسه (`pricing/lib`)،
   والصفحة دي بتعرض الناتج بس. كده مستحيل اللوحة والخدمة يختلفوا، وأي قرار
   تسعير جديد يسري على الاتنين في نفس اللحظة.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ======================================================================
     التسعير: كل الأرقام من الخدمة، مفيش أي حساب هنا
     ====================================================================== */
  /** بيرجّع الخدمة لو مربوطة وفيه جلسة إدارية، وإلا سبب واضح للعرض. */
  function priceService() {
    if (!window.migoApi || !window.migoApi.isConfigured()) {
      return { ok: false, message: "خدمة المنصة مش مربوطة. الهامش وسعر البيع بيتحسبوا على الخدمة بمحرك التسعير الرسمي، فمفيش أرقام هنا." };
    }
    var A = window.MigoAuth;
    if (!A || typeof A.isSignedIn !== "function" || !A.isSignedIn()) {
      return { ok: false, message: "سجّل دخولك بحساب إداري عشان الخدمة تحسب الهامش وسعر البيع." };
    }
    return { ok: true, api: window.migoApi };
  }

  /** بطاقة واحدة بأسلوب اللوحة. */
  function priceNotice(host, cls, title, msg) {
    if (!host) return;
    host.innerHTML = '<div class="card"><div class="k">' + esc(title) + '</div><div class="v">' +
      '<span class="' + cls + '">' + esc(msg) + "</span></div></div>";
  }

  /** عرض ناتج المعاينة (أو سبب رفض المحرك) بشكل موحّد. */
  function renderPreview(host, preview) {
    if (!host) return;
    if (!preview || preview.priced === false) {
      var msg = (preview && preview.message) || "تعذّر حساب السعر.";
      var code = preview && preview.reason ? ' <span class="dim mono" style="font-size:var(--fs-xs)">' + esc(preview.reason) + "</span>" : "";
      host.innerHTML = '<div class="card"><div class="k">مفيش سعر</div><div class="v">' +
        '<span class="pill danger">' + esc(msg) + "</span>" + code + "</div></div>";
      return;
    }
    var out = [
      ["الشريحة المطبَّقة", esc(preview.tier && preview.tier.label ? preview.tier.label + " (" + preview.tier.rule + ")" : "-")],
      ["الهامش", mono("$" + preview.marginUsd)],
      ["سعر البيع USD", mono("$" + preview.saleUsd)]
    ];
    if (preview.egp && preview.egp.available) {
      out.push(["سعر البيع EGP (تجريبي)", mono(preview.egp.value + " ج.م")]);
    } else if (preview.egp) {
      out.push(["سعر البيع EGP", '<span class="dim">' + esc(preview.egp.message || "غير متاح") + "</span>"]);
    }
    host.innerHTML = out.map(function (x) {
      return '<div class="card"><div class="k">' + x[0] + '</div><div class="v">' + x[1] + "</div></div>";
    }).join("");
  }

  /** نداء المعاينة مع تعقّب آخر طلب عشان الردود توصل بترتيبها. */
  function runPreview(host, costUsd, fxRate, opts) {
    opts = opts || {};
    if (!host) return;
    var svc = priceService();
    var hasInput = costUsd !== "" && costUsd !== undefined && costUsd !== null;

    /* مفيش تكلفة مكتوبة: نقول المطلوب، أو نوضّح إن الخدمة مش مربوطة. */
    if (!hasInput) {
      if (!svc.ok) { priceNotice(host, "dim", opts.title || "حاسبة الهامش", svc.message); return; }
      host.innerHTML = '<p class="dim">' + esc(opts.empty || "اكتب تكلفة المزوّد بالدولار.") + "</p>";
      return;
    }
    if (!svc.ok) { priceNotice(host, "dim", opts.title || "حاسبة الهامش", svc.message); return; }

    host._previewSeq = (host._previewSeq || 0) + 1;
    var mine = host._previewSeq;
    host.innerHTML = '<p class="dim">جاري الحساب على الخدمة...</p>';
    svc.api.pricePreview(costUsd, fxRate).then(function (p) {
      if (mine !== host._previewSeq) return;
      renderPreview(host, p);
    }).catch(function (e) {
      if (mine !== host._previewSeq) return;
      host.innerHTML = '<div class="card"><div class="k">تعذّر الحساب</div><div class="v">' +
        '<span class="pill danger">' + esc((e && e.message) || "خطأ غير متوقع") + "</span>" +
        (e && e.code ? ' <span class="dim mono" style="font-size:var(--fs-xs)">' + esc(e.code) + "</span>" : "") + "</div></div>";
    });
  }

  /* ======================================================================
     أدوات عرض
     ====================================================================== */
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
    var dl = [
      ["الدومين", mono(d.name)],
      ["الحالة", pill(d.status, d.label)],
      ["العميل", mono(d.cust)],
      ["تاريخ الانتهاء", esc(String(d.expires))],
      ["المتبقي", mono(daysLeft(d.expires) === null ? "-" : daysLeft(d.expires) + " يوم")],
      ["التجديد التلقائي", d.auto ? pill("ok", "مفعّل") : pill("warn", "متوقف")],
      ["عدد الـNameservers", mono(String(d.ns))]
    ];
    openDetail(d.name, kv(dl) + '<div id="detailMoney"></div>' +
      '<div class="row wrap-flex mt-4"><button class="btn btn-sm" data-toast="تجديد ' + esc(d.name) + ' (تجريبي)" type="button">تجديد تجريبي</button>' +
      '<button class="btn btn-ghost btn-sm" data-toast="إيقاف/تشغيل التجديد (تجريبي)" type="button">تبديل التجديد</button></div>');

    /* الأرقام الداخلية بتتحسب على الخدمة، والدرج بيفتح فورًا ونحدّثه لما توصل. */
    var host = $("#detailMoney");
    if (!host) return;
    var svc = priceService();
    if (!svc.ok) {
      host.innerHTML = '<div class="card dz mt-4"><p class="hint">' + esc(svc.message) + "</p></div>";
      return;
    }
    host.innerHTML = '<div class="card dz mt-4"><strong style="font-size:var(--fs-sm)">أرقام داخلية (مش للعميل)</strong>' +
      '<p class="hint mt-2">جاري الحساب على الخدمة...</p></div>';
    svc.api.pricePreview(d.cost).then(function (p) {
      var ok = p && p.priced !== false;
      host.innerHTML = '<div class="card dz mt-4"><strong style="font-size:var(--fs-sm)">أرقام داخلية (مش للعميل)</strong><div class="mt-3">' +
        kv([
          ["تكلفة المزوّد", mono("$" + d.cost)],
          ["الشريحة المطبَّقة", esc(ok && p.tier ? p.tier.label : "-")],
          ["الهامش", mono("$" + (ok ? p.marginUsd : "-"))],
          ["سعر البيع USD", mono("$" + (ok ? p.saleUsd : "-"))]
        ]) + "</div>" +
        (ok ? "" : '<p class="pill danger mt-2">' + esc((p && p.message) || "تعذّر حساب السعر.") + "</p>") +
        '<p class="hint mt-2">القيم دي بتظهر في لوحة الإدارة فقط، وبتتحسب على الخدمة بمحرك التسعير الرسمي.</p></div>';
    }).catch(function (e) {
      host.innerHTML = '<div class="card dz mt-4"><strong style="font-size:var(--fs-sm)">أرقام داخلية (مش للعميل)</strong>' +
        '<p class="hint mt-2">تعذّر حساب الأرقام الداخلية: ' + esc((e && e.message) || "خطأ غير متوقع") + "</p></div>";
    });
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
     5) التسعير + الحاسبة — كل الناتج من الخدمة
     ====================================================================== */
  /* جدول الشرائح عرض للسياسة المعتمدة (نفس أرقام docs/PRICING_POLICY.md). */
  set("#admPricing", window.ADMIN_TIERS.map(function (t) {
    return row([esc(t.range), esc(t.rule)]);
  }).join(""));

  (function () {
    var inp = $("#calcCost"), fx = $("#calcFx");
    var host = $("#calcOut");
    function run() {
      if (!host) return;
      var raw = inp ? inp.value.trim() : "";
      var fxv = fx ? fx.value.trim() : "";
      runPreview(host, raw, fxv, {
        title: "حاسبة الهامش",
        empty: "اكتب تكلفة المزوّد بالدولار لعرض الهامش وسعر البيع."
      });
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
