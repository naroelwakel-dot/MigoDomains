/* ==========================================================================
   Migo Domains - السلة (صفحة cart.html)
   بيانات تجريبية فقط. الحساب محلي في المتصفح، مفيش أي دفع أو خدمة خارجية.
   ========================================================================== */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var body = $("#cartBody");
  if (!body) return;

  var items = [
    { name: "migo-egypt.com", op: "تسجيل", years: 1, price: 12.99 },
    { name: "migo-egypt.net", op: "تسجيل", years: 1, price: 13.99 },
    { name: "migo-egypt.io", op: "نقل", years: 0, price: 33.99 }
  ];

  function money(n) { return "$" + n.toFixed(2); }

  function render() {
    if (!items.length) {
      body.innerHTML = "";
      var wrap = $("#cartWrap");
      if (wrap) wrap.innerHTML = '<div class="empty">السلة فاضية. <a href="search.html">ابحث عن دومين</a>.</div>';
      return;
    }
    body.innerHTML = items.map(function (it, i) {
      var period = it.years ? (it.years + " سنة") : "-";
      return "<tr>" +
        '<td class="mono">' + it.name + "</td>" +
        "<td>" + it.op + "</td>" +
        "<td>" + period + "</td>" +
        '<td class="mono">' + money(it.price) + "</td>" +
        '<td><button class="btn btn-ghost btn-sm" data-remove="' + i + '">إزالة</button></td>' +
        "</tr>";
    }).join("");
    var total = items.reduce(function (s, it) { return s + it.price; }, 0);
    var sum = $("#cartSummary");
    if (sum) {
      sum.innerHTML =
        '<div class="row-between"><span class="muted">عدد البنود</span><span class="mono">' + items.length + "</span></div>" +
        '<div class="row-between mt-2"><span class="muted">الإجمالي</span><span class="mono" style="font-size:var(--fs-h2)">' + money(total) + "</span></div>" +
        '<p class="dim mt-3" style="font-size:var(--fs-xs)">الأسعار توضيحية في هذه المرحلة. سعر التجديد بيُعرض منفصل قبل الدفع.</p>' +
        '<a class="btn btn-primary mt-4" href="checkout.html" style="width:100%">متابعة الدفع</a>' +
        '<a class="btn btn-ghost mt-2" href="search.html" style="width:100%">متابعة التسوق</a>';
    }
  }

  body.addEventListener("click", function (e) {
    var b = e.target.closest("[data-remove]");
    if (!b) return;
    items.splice(Number(b.getAttribute("data-remove")), 1);
    render();
    if (window.migoToast) window.migoToast("تم حذف البند من السلة (تجريبي)");
  });

  render();
})();
