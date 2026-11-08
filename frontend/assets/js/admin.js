/* ==========================================================================
   Migo Domains - لوحة الإدارة (صفحة admin.html)
   بيانات تجريبية فقط. تكلفة المزوّد والهامش بتظهر هنا فقط (مش في واجهة العميل).
   مزوّد التسجيل بيظهر "غير متصل" لأن مفيش أي حساب أو تكامل حقيقي لحد الآن.
   ========================================================================== */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* --- تبويبات الأقسام --- */
  var links = $$("[data-apanel]");
  var panels = $$("[data-apage]");
  function show(name) {
    links.forEach(function (a) { a.setAttribute("aria-current", a.getAttribute("data-apanel") === name ? "true" : "false"); });
    panels.forEach(function (p) { p.hidden = p.getAttribute("data-apage") !== name; });
    var drawer = $("#adminNav"); if (drawer) drawer.classList.remove("open");
  }
  links.forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); show(a.getAttribute("data-apanel")); }); });
  if (links[0]) show(links[0].getAttribute("data-apanel"));

  /* --- بيانات تجريبية --- */
  var KPI = [
    { k: "دومينات نشطة", v: "128" }, { k: "طلبات هذا الشهر", v: "43" },
    { k: "إيراد (تجريبي)", v: "$1,284" }, { k: "هامش (تجريبي)", v: "$318" },
    { k: "قرب تنتهي", v: "7" }
  ];
  var DOMAINS = [
    { name: "migo-egypt.com", cust: "a***@example.com", status: "ok", label: "نشط" },
    { name: "migo-egypt.net", cust: "b***@example.com", status: "warn", label: "قرب يخلص" },
    { name: "migo-store.org", cust: "c***@example.com", status: "info", label: "منقول" }
  ];
  var ORDERS = [
    { id: "ORD-1041", cust: "a***@example.com", total: "$12.99", status: "ok", label: "مكتمل" },
    { id: "ORD-1040", cust: "b***@example.com", total: "$13.99", status: "warn", label: "قيد المعالجة" },
    { id: "ORD-1039", cust: "c***@example.com", total: "$33.99", status: "danger", label: "فشل" }
  ];
  var CUST = [
    { email: "a***@example.com", domains: 2, since: "2026" },
    { email: "b***@example.com", domains: 1, since: "2026" },
    { email: "c***@example.com", domains: 1, since: "2026" }
  ];
  var PRICING = [
    { tier: "أقل من 8", rule: "+2.50 ثابت" }, { tier: "من 8 لأقل من 15", rule: "+3.00 ثابت" },
    { tier: "من 15 لـ30", rule: "+4.00 ثابت" }, { tier: "أكبر من 30", rule: "15% بحد أدنى 4.00" }
  ];
  var AUDIT = [
    { user: "admin", op: "تعديل سعر", item: ".com", res: "ok" },
    { user: "admin", op: "إضافة امتداد", item: ".dev", res: "ok" },
    { user: "system", op: "تحديث تكلفة", item: "مزوّد", res: "warn" }
  ];

  function pill(s, l) { return '<span class="pill ' + s + '">' + l + "</span>"; }
  function set(sel, html) { var el = $(sel); if (el) el.innerHTML = html; }

  set("#kpis", KPI.map(function (k) {
    return '<div class="card card-tight"><div class="dim" style="font-size:var(--fs-xs)">' + k.k + "</div>" +
      '<div class="mono mt-2" style="font-size:var(--fs-h2)">' + k.v + "</div></div>";
  }).join(""));

  set("#admDomains", DOMAINS.map(function (d) {
    return "<tr><td class=\"mono\">" + d.name + "</td><td class=\"mono\">" + d.cust + "</td><td>" + pill(d.status, d.label) + "</td></tr>";
  }).join(""));

  set("#admOrders", ORDERS.map(function (o) {
    return "<tr><td class=\"mono\">" + o.id + "</td><td class=\"mono\">" + o.cust + "</td><td class=\"mono\">" + o.total + "</td><td>" + pill(o.status, o.label) + "</td></tr>";
  }).join(""));

  set("#admCustomers", CUST.map(function (c) {
    return "<tr><td class=\"mono\">" + c.email + "</td><td class=\"mono\">" + c.domains + "</td><td>" + c.since + "</td></tr>";
  }).join(""));

  set("#admPricing", PRICING.map(function (p) {
    return "<tr><td>" + p.tier + "</td><td>" + p.rule + "</td></tr>";
  }).join(""));

  set("#admAudit", AUDIT.map(function (a) {
    return "<tr><td>" + a.user + "</td><td>" + a.op + "</td><td class=\"mono\">" + a.item + "</td><td>" + pill(a.res, a.res === "ok" ? "نجح" : "تحذير") + "</td></tr>";
  }).join(""));
})();
