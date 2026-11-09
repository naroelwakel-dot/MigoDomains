/* ==========================================================================
   Migo Domains - صفحة تفاصيل الدومين (domain.html)
   --------------------------------------------------------------------------
   كل حاجة في الصفحة بتيجي من خدمة المنصة:
     • الحالة من `/availability`
     • الأسعار من `/quote` (تسجيل / تجديد / نقل)

   **مفيش أي سعر مكتوب في الصفحة ولا بيتحسب هنا.** الإجمالي = عرض سعر
   التسجيل زي ما رجع من السيرفر، وبنضربه في عدد السنين **ممنوع**، لأن
   التسعير متعدد السنوات لسه مش متاح في الخدمة.
   ========================================================================== */
(function () {
  "use strict";

  var root = document.getElementById("domain-app");
  if (!root) return;

  var OPERATIONS = ["registration", "renewal", "transfer"];
  var OP_LABELS = { registration: "التسجيل", renewal: "التجديد", transfer: "النقل" };
  var OP_NOTES = {
    registration: "السنة الأولى",
    renewal: "يبدأ من تاريخ الانتهاء",
    transfer: "يحتاج الدومين مؤهّل للنقل وAuth Code"
  };

  var el = {
    domains: root.querySelectorAll("[data-domain]"),
    state: root.querySelector("[data-state]"),
    notice: root.querySelector("[data-notice]"),
    cards: root.querySelector("[data-ops]"),
    table: root.querySelector("[data-ops-table]"),
    total: root.querySelector("[data-total]"),
    add: root.querySelector("[data-add]"),
    pay: root.querySelector("[data-pay]")
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }
  function ask(domain) {
    var p = new URLSearchParams(location.search);
    return p.get(domain) || p.get("domain") || p.get("q") || "";
  }
  function cleanName(v) {
    return String(v || "").trim().toLowerCase()
      .replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\s+/g, "");
  }
  function setDomains(name) {
    for (var i = 0; i < el.domains.length; i++) el.domains[i].textContent = name;
  }
  function setNotice(html) { if (el.notice) el.notice.innerHTML = html; }

  function priceHtml(quote) {
    var p = window.migoApi.priceSummary(quote);
    if (!p) return '<span class="dim" style="font-size:var(--fs-xs)">السعر مش متاح دلوقتي</span>';
    return '<span class="mono" style="font-size:var(--fs-h2)">' + esc(p.text) + "</span>";
  }

  function renderCards(prices) {
    if (!el.cards) return;
    el.cards.innerHTML = OPERATIONS.map(function (op) {
      var q = prices[op];
      return '<div class="card card-tight">' +
        '<div class="dim" style="font-size:var(--fs-xs)">سعر ' + OP_LABELS[op] + "</div>" +
        '<div class="mt-2">' + (q && q.ok !== false ? priceHtml(q.quote) : '<span class="dim" style="font-size:var(--fs-xs)">' + esc((q && q.message) || "مش متاح") + "</span>") + "</div>" +
        '<div class="hint">' + OP_NOTES[op] + "</div></div>";
    }).join("");
  }

  function renderTable(prices) {
    if (!el.table) return;
    el.table.innerHTML = OPERATIONS.map(function (op) {
      var q = prices[op];
      var value = q && q.ok !== false
        ? esc((window.migoApi.priceSummary(q.quote) || {}).text || "مش متاح")
        : '<span class="dim">مش متاح</span>';
      return "<tr><td>" + OP_LABELS[op] + '</td><td class="mono">' + value + "</td><td>" + OP_NOTES[op] + "</td></tr>";
    }).join("") +
      '<tr><td>تحديث بيانات المالك</td><td class="mono">حسب الامتداد</td><td>قد يطلب توثيق</td></tr>';
  }

  function renderNotConfigured(name) {
    setDomains(name);
    setNotice('<div class="card"><h2 class="h2">خدمة المنصة مش مربوطة بعد</h2>' +
      '<p class="lead mt-2">الصفحة دي بتعرض حالة التوفّر والأسعار من خدمة المنصة. ' +
      "وطول ما <span class=\"mono\">window.MIGO_API.baseUrl</span> في <span class=\"mono\">config.js</span> فاضي، مفيش حاجة تتعبّى.</p>" +
      '<p class="muted mt-3" style="font-size:var(--fs-sm)">مش بنعرض أسعار تجريبية عشان محدش ياخد قرار على رقم مش حقيقي.</p></div>');
    if (el.cards) el.cards.innerHTML = "";
    if (el.table) el.table.innerHTML = "";
    if (el.total) el.total.textContent = "-";
    if (el.add) el.add.disabled = true;
  }

  function run() {
    var name = cleanName(ask("q"));
    setDomains(name);
    if (!name) {
      setNotice('<div class="card"><h2 class="h2">مفيش دومين مختار</h2>' +
        '<p class="lead mt-2">افتح الصفحة من نتائج البحث، أو ابعت اسم الدومين في العنوان.</p>' +
        '<a class="btn btn-primary mt-4" href="search.html">ابحث عن دومين</a></div>');
      return;
    }
    if (!window.migoApi || !window.migoApi.isConfigured()) { renderNotConfigured(name); return; }

    setNotice('<div class="card"><span class="muted">جاري فحص </span><span class="mono">' + esc(name) + "</span></div>");

    var prices = {};
    var jobs = OPERATIONS.map(function (op) {
      return window.migoApi.quote(name, op).then(function (env) {
        prices[op] = env && env.ok !== false ? { ok: true, quote: env.quote } : { ok: false, message: "مش متاح" };
      }).catch(function (e) {
        prices[op] = { ok: false, code: e && e.code, message: (e && e.code === "MOCK_NOT_A_REAL_PRICE") ? "المزوّد الحقيقي مش مربوط لسه" : ((e && e.message) || "تعذّر جلب السعر") };
      });
    });

    Promise.all([window.migoApi.availability(name)].concat(jobs)).then(function (all) {
      var avail = all[0] || {};
      var label = window.migoApi.stateLabel(avail.state);
      if (el.state) el.state.innerHTML = '<span class="pill ' + label.tone + '">' + esc(label.label) + "</span>";
      var available = avail.state === "AVAILABLE_CONFIRMED";
      setNotice("");

      renderCards(prices);
      renderTable(prices);

      var reg = prices.registration;
      if (el.total) {
        el.total.textContent = (reg && reg.ok && window.migoApi.priceSummary(reg.quote))
          ? window.migoApi.priceSummary(reg.quote).text : "-";
      }
      if (el.add) {
        el.add.disabled = !available;
        el.add.setAttribute("data-domain-add", name);
        if (!available) el.add.textContent = "مش متاح للتسجيل";
      }
      if (el.pay) el.pay.setAttribute("href", "checkout.html?q=" + encodeURIComponent(name));
    });
  }

  /* إضافة للسلة: بنخزّن الاختيار بس. السعر بيتجاب تاني في صفحة السلة. */
  root.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-domain-add]") : null;
    if (!b || b.disabled) return;
    var name = b.getAttribute("data-domain-add");
    window.migoCart.add({ domain: name, operation: "registration", years: 1 });
    if (window.migoToast) window.migoToast("تمت إضافة " + name + " للسلة");
  });

  run();
})();
