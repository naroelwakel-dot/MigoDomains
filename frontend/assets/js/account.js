/* ==========================================================================
   Migo Domains - حسابي (صفحة account.html)
   بيانات تجريبية فقط. مفيش أي حساب حقيقي ولا اتصال خارجي.
   ========================================================================== */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };

  var DOMAINS = [
    { name: "migo-egypt.com", status: "ok", label: "نشط", renew: "12 نوفمبر 2027", auto: "مفعّل" },
    { name: "migo-egypt.net", status: "warn", label: "قرب يخلص", renew: "20 نوفمبر 2026", auto: "متوقف" },
    { name: "migo-store.org", status: "info", label: "منقول", renew: "قيد النقل", auto: "-" }
  ];
  var ORDERS = [
    { id: "ORD-1041", date: "8 نوفمبر 2026", item: "migo-egypt.com", total: "$12.99", status: "ok", label: "مكتمل" },
    { id: "ORD-1040", date: "8 نوفمبر 2026", item: "migo-egypt.net", total: "$13.99", status: "warn", label: "قيد المعالجة" },
    { id: "ORD-1039", date: "7 نوفمبر 2026", item: "migo-egypt.io", total: "$33.99", status: "danger", label: "فشل - بانتظار مراجعة" }
  ];

  function pill(status, label) {
    return '<span class="pill ' + status + '">' + label + "</span>";
  }
  function fill(sel, rows) {
    var el = $(sel);
    if (el) el.innerHTML = rows;
  }

  fill("#domBody", DOMAINS.map(function (d) {
    return "<tr><td class=\"mono\">" + d.name + "</td><td>" + pill(d.status, d.label) + "</td>" +
      "<td>" + d.renew + "</td><td>" + d.auto + "</td>" +
      '<td><a class="btn btn-sm" href="manage.html">إدارة</a></td></tr>';
  }).join(""));

  fill("#renBody", DOMAINS.filter(function (d) { return d.status !== "info"; }).map(function (d) {
    return "<tr><td class=\"mono\">" + d.name + "</td><td>" + d.renew + "</td>" +
      '<td><button class="btn btn-primary btn-sm" data-toast="تجديد ' + d.name + ' (تجريبي)">جدّد الآن</button></td></tr>';
  }).join(""));

  fill("#ordBody", ORDERS.map(function (o) {
    return "<tr><td class=\"mono\">" + o.id + "</td><td>" + o.date + "</td>" +
      '<td class="mono">' + o.item + "</td><td class=\"mono\">" + o.total + "</td><td>" + pill(o.status, o.label) + "</td></tr>";
  }).join(""));
})();
