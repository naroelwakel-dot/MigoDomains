/* ==========================================================================
   Migo Domains - السلة (صفحة cart.html)
   --------------------------------------------------------------------------
   السلة بتخزّن **اختيارات العميل بس** (من `migoCart`). كل سعر في الجدول
   بيتجاب لحظيًا من `/quote` بتاع خدمة المنصة، وما فيش أي جمع حسابات هنا.

   لو الخدمة مش مربوطة، بنقول كده وما بنعرضش أي رقم.
   ملاحظة صريحة: ده ملخّص عرض، مش فاتورة. الإجمالي النهائي بيتثبّت وقت
   إنشاء الطلب على السيرفر.
   ========================================================================== */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var body = $("#cartBody");
  if (!body) return;

  var OP_LABELS = { registration: "تسجيل", renewal: "تجديد", transfer: "نقل" };
  var rows = []; // { it, price|null, error|null }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }
  function opLabel(op) { return OP_LABELS[op] || esc(op || "تسجيل"); }

  function configured() { return !!(window.migoApi && window.migoApi.isConfigured()); }

  function renderEmpty(msg) {
    var wrap = $("#cartWrap");
    if (wrap) {
      wrap.innerHTML = '<div class="empty">' + msg + '</div>';
    }
  }

  function renderNotConfigured() {
    var wrap = $("#cartWrap");
    if (wrap) {
      wrap.innerHTML =
        '<div class="empty" style="grid-column:1/-1">' +
        "<h2 class=\"h2\">خدمة المنصة مش مربوطة بعد</h2>" +
        '<p class="lead mt-2">مش بنعرض أي سعر لحد ما `window.MIGO_API.baseUrl` في <span class="mono">config.js</span> يتظبط.</p>' +
        "</div>";
    }
  }

  function draw() {
    if (!rows.length) { renderEmpty('السلة فاضية. <a href="search.html">ابحث عن دومين</a>.'); return; }

    body.innerHTML = rows.map(function (r, i) {
      var it = r.it;
      var period = it.years ? (it.years + " سنة") : "-";
      var priceCell;
      if (r.error) {
        priceCell = '<span class="dim" style="font-size:var(--fs-xs);color:var(--warn)">' + esc(r.error) + "</span>";
      } else if (r.price && r.priceText) {
        priceCell = '<span class="mono">' + esc(r.priceText) + "</span>";
      } else {
        priceCell = '<span class="skeleton" style="display:inline-block;width:64px;height:16px"></span>';
      }
      return "<tr>" +
        '<td class="mono">' + esc(it.domain) + "</td>" +
        "<td>" + opLabel(it.operation) + "</td>" +
        "<td>" + esc(period) + "</td>" +
        "<td>" + priceCell + "</td>" +
        '<td><button class="btn btn-ghost btn-sm" data-remove="' + i + '">إزالة</button></td>' +
        "</tr>";
    }).join("");

    var sum = $("#cartSummary");
    if (!sum) return;

    var known = rows.filter(function (r) { return r.egpValue != null; });
    var total = known.reduce(function (s, r) { return s + r.egpValue; }, 0);
    var pending = rows.length - known.length;

    sum.innerHTML =
      '<div class="row-between"><span class="muted">عدد البنود</span><span class="mono">' + rows.length + "</span></div>" +
      (known.length
        ? '<div class="row-between mt-2"><span class="muted">إجمالي معروض</span><span class="mono" style="font-size:var(--fs-h2)">' +
          total.toFixed(2) + " ج.م</span></div>"
        : "") +
      (pending ? '<p class="dim mt-3" style="font-size:var(--fs-xs)">في ' + pending + " بند لسه بنجيب سعره من الخدمة.</p>" : "") +
      '<p class="dim mt-3" style="font-size:var(--fs-xs)">ده ملخّص عرض. الإجمالي النهائي بيتثبّت لحظة إنشاء الطلب على السيرفر.</p>' +
      (configured()
        ? '<a class="btn btn-primary mt-4" href="checkout.html" style="width:100%">متابعة الدفع</a>'
        : '<button class="btn btn-primary mt-4" disabled style="width:100%">الدفع غير متاح - الخدمة مش مربوطة</button>') +
      '<a class="btn btn-ghost mt-2" href="search.html" style="width:100%">متابعة التسوق</a>';
  }

  function loadQuotes() {
    if (!configured()) { renderNotConfigured(); return; }
    rows = (window.migoCart.items() || []).map(function (it) { return { it: it, priceText: null, egpValue: null, error: null }; });
    draw();
    rows.forEach(function (r, i) {
      window.migoApi.quote(r.it.domain, r.it.operation || "registration")
        .then(function (res) {
          var q = res && res.quote ? res.quote : null;
          var p = window.migoApi.priceSummary(q);
          if (!p) { r.error = "السعر مش متاح دلوقتي"; }
          else {
            r.priceText = p.text;
            if (p.currency === "EGP") r.egpValue = Number(String(q.egp.value).replace(/,/g, ""));
          }
          draw();
        })
        .catch(function (e) {
          r.error = (e && e.code === "MOCK_NOT_A_REAL_PRICE")
            ? "السعر مش متاح - المزوّد الحقيقي مش مربوط"
            : ((e && e.message) || "تعذّر جلب السعر");
          draw();
        });
    });
  }

  body.addEventListener("click", function (e) {
    var b = e.target.closest("[data-remove]");
    if (!b) return;
    var r = rows[Number(b.getAttribute("data-remove"))];
    if (!r) return;
    window.migoCart.remove(r.it.domain, r.it.operation);
    loadQuotes();
    if (window.migoToast) window.migoToast("تم حذف " + r.it.domain + " من السلة");
  });

  loadQuotes();
})();
