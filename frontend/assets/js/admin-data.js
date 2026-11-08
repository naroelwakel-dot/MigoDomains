/* ==========================================================================
   Migo Domains - بيانات لوحة الإدارة التجريبية (صفحة admin.html)
   --------------------------------------------------------------------------
   كل ده بيانات عرض من صنع الإيد. مفيش أي عميل حقيقي، ولا أي رقم حقيقي،
   ولا أي اتصال بقاعدة بيانات أو مزوّد. تكلفة المزوّد والهامش **مسموح**
   يظهروا هنا فقط (لوحة الإدارة)، وممنوع ظهورهم في واجهة العميل.

   التكلفة مكتوبة نص عشري (USD). الهامش وسعر البيع بيتحسبوا وقت العرض من
   نفس قواعد التسعير المعتمدة عبر adminCalc في admin.js.
   ========================================================================== */
(function () {
  "use strict";

  /* الأقسام الثمانية المعتمدة في docs/DESIGN_SYSTEM.md (قسم 9) */
  window.ADMIN_SECTIONS = [
    { id: "overview", label: "نظرة عامة" },
    { id: "domains", label: "الدومينات" },
    { id: "orders", label: "الطلبات" },
    { id: "customers", label: "العملاء" },
    { id: "pricing", label: "التسعير" },
    { id: "provider", label: "المزوّد / Sandbox" },
    { id: "audit", label: "السجلات" },
    { id: "settings", label: "الإعدادات" }
  ];

  /* شرائح الهامش المعتمدة - مرآة لـ pricing/lib/tiers.js */
  window.ADMIN_TIERS = [
    { id: "tier_under_8", label: "أقل من 8", rule: "+2.50 ثابت", range: "من 0 إلى أقل من 8" },
    { id: "tier_8_to_15", label: "من 8 إلى أقل من 15", rule: "+3.00 ثابت", range: "من 8 إلى أقل من 15" },
    { id: "tier_15_to_30", label: "من 15 إلى 30", rule: "+4.00 ثابت", range: "من 15 إلى 30 (شاملًا)" },
    { id: "tier_over_30", label: "أكثر من 30", rule: "15% بحد أدنى 4.00", range: "أكبر من 30" }
  ];

  /* الدومينات: cost = تكلفة المزوّد الكلية بالدولار (نص) */
  window.ADMIN_DOMAINS = [
    { name: "migo-egypt.com", cust: "a***@example.com", status: "ok", label: "نشط", expires: "2027-11-12", auto: true, cost: "9.20", ns: 2 },
    { name: "migo-egypt.net", cust: "b***@example.com", status: "warn", label: "قرب يخلص", expires: "2026-11-20", auto: false, cost: "9.60", ns: 2 },
    { name: "migo-egypt.io", cust: "c***@example.com", status: "danger", label: "فشل التجديد", expires: "2026-10-30", auto: false, cost: "32.10", ns: 2 },
    { name: "migo-egypt.org", cust: "d***@example.com", status: "ok", label: "نشط", expires: "2027-05-04", auto: true, cost: "11.40", ns: 2 },
    { name: "migo-egypt.dev", cust: "e***@example.com", status: "ok", label: "نشط", expires: "2027-02-18", auto: true, cost: "12.90", ns: 4 },
    { name: "migo-egypt.app", cust: "f***@example.com", status: "info", label: "منقول", expires: "قيد النقل", auto: false, cost: "10.10", ns: 2 },
    { name: "migo-egypt.store", cust: "g***@example.com", status: "ok", label: "نشط", expires: "2027-08-01", auto: true, cost: "29.50", ns: 2 },
    { name: "migo-egypt.shop", cust: "h***@example.com", status: "warn", label: "قرب يخلص", expires: "2026-12-02", auto: false, cost: "27.80", ns: 2 },
    { name: "migo-egypt.cloud", cust: "i***@example.com", status: "ok", label: "نشط", expires: "2027-03-15", auto: true, cost: "19.90", ns: 6 },
    { name: "migo-egypt.online", cust: "j***@example.com", status: "danger", label: "فشل التجديد", expires: "2026-09-22", auto: false, cost: "31.20", ns: 2 },
    { name: "migo-egypt.xyz", cust: "k***@example.com", status: "ok", label: "نشط", expires: "2027-01-09", auto: true, cost: "7.90", ns: 2 },
    { name: "migo-egypt.me", cust: "l***@example.com", status: "ok", label: "نشط", expires: "2027-06-27", auto: true, cost: "14.60", ns: 2 }
  ];

  /* الطلبات: amount = سعر البيع المدفوع (نص USD) */
  window.ADMIN_ORDERS = [
    { id: "ORD-1041", date: "8 نوفمبر 2026", cust: "a***@example.com", item: "migo-egypt.com", op: "تسجيل", amount: "12.99", status: "ok", label: "مكتمل" },
    { id: "ORD-1040", date: "8 نوفمبر 2026", cust: "b***@example.com", item: "migo-egypt.net", op: "تجديد", amount: "13.99", status: "warn", label: "قيد المعالجة" },
    { id: "ORD-1039", date: "7 نوفمبر 2026", cust: "c***@example.com", item: "migo-egypt.io", op: "تجديد", amount: "33.99", status: "danger", label: "فشل", reason: "رفض من بوابة الدفع - البطاقة مرفوضة" },
    { id: "ORD-1038", date: "7 نوفمبر 2026", cust: "d***@example.com", item: "migo-egypt.org", op: "تسجيل", amount: "15.99", status: "ok", label: "مكتمل" },
    { id: "ORD-1037", date: "6 نوفمبر 2026", cust: "e***@example.com", item: "migo-egypt.dev", op: "تسجيل", amount: "17.99", status: "ok", label: "مكتمل" },
    { id: "ORD-1036", date: "6 نوفمبر 2026", cust: "f***@example.com", item: "migo-egypt.app", op: "نقل وارد", amount: "13.99", status: "info", label: "قيد النقل" },
    { id: "ORD-1035", date: "5 نوفمبر 2026", cust: "g***@example.com", item: "migo-egypt.store", op: "تسجيل", amount: "34.99", status: "ok", label: "مكتمل" },
    { id: "ORD-1034", date: "5 نوفمبر 2026", cust: "h***@example.com", item: "migo-egypt.shop", op: "تجديد", amount: "32.99", status: "warn", label: "بانتظار الدفع" },
    { id: "ORD-1033", date: "4 نوفمبر 2026", cust: "i***@example.com", item: "migo-egypt.cloud", op: "تسجيل", amount: "23.99", status: "ok", label: "مكتمل" },
    { id: "ORD-1032", date: "4 نوفمبر 2026", cust: "j***@example.com", item: "migo-egypt.online", op: "تجديد", amount: "35.99", status: "danger", label: "فشل", reason: "عدم تطابق المبلغ المحوَّل مع إجمالي الطلب" }
  ];

  window.ADMIN_CUSTOMERS = [
    { email: "a***@example.com", domains: 2, orders: 3, since: "2026", spent: "38.97" },
    { email: "b***@example.com", domains: 1, orders: 1, since: "2026", spent: "13.99" },
    { email: "c***@example.com", domains: 1, orders: 2, since: "2026", spent: "33.99" },
    { email: "d***@example.com", domains: 1, orders: 1, since: "2026", spent: "15.99" },
    { email: "e***@example.com", domains: 1, orders: 1, since: "2026", spent: "17.99" },
    { email: "g***@example.com", domains: 1, orders: 1, since: "2026", spent: "34.99" },
    { email: "i***@example.com", domains: 2, orders: 1, since: "2026", spent: "23.99" },
    { email: "k***@example.com", domains: 1, orders: 0, since: "2026", spent: "0.00" }
  ];

  /* الإيراد والهامش الشهري (تجريبي) - إيراد USD / هامش USD */
  window.ADMIN_REVENUE = [
    { month: "يوليو", revenue: "612.00", margin: "148.00" },
    { month: "أغسطس", revenue: "803.00", margin: "197.00" },
    { month: "سبتمبر", revenue: "941.00", margin: "231.00" },
    { month: "أكتوبر", revenue: "1102.00", margin: "274.00" },
    { month: "نوفمبر", revenue: "1284.00", margin: "318.00" }
  ];

  /* القدرات الاثنتا عشرة اللي عقد المزوّد بيغطّيها (مرآة providers/lib/states.js) */
  window.ADMIN_CAPABILITIES = [
    { key: "register", label: "تسجيل دومين" },
    { key: "renew", label: "تجديد" },
    { key: "restore", label: "استرجاع" },
    { key: "transferIn", label: "نقل وارد" },
    { key: "transferOut", label: "نقل صادر" },
    { key: "contactsUpdate", label: "تحديث جهات الاتصال" },
    { key: "nameservers", label: "تعديل Nameservers" },
    { key: "dns", label: "إدارة سجلات DNS" },
    { key: "authCode", label: "إصدار رمز النقل" },
    { key: "locks", label: "أقفال النقل" },
    { key: "dnssec", label: "DNSSEC" },
    { key: "perDomainRegistrant", label: "مالك مختلف لكل دومين" }
  ];

  window.ADMIN_AUDIT = [
    { time: "18:02", actor: "admin", op: "تعديل شريحة هامش", target: "tier_over_30", result: "ok" },
    { time: "17:48", actor: "admin", op: "إضافة امتداد للسعر", target: ".dev", result: "ok" },
    { time: "17:20", actor: "system", op: "تحديث تكلفة المزوّد", target: "Openprovider", result: "warn" },
    { time: "16:55", actor: "admin", op: "مراجعة طلب فاشل", target: "ORD-1039", result: "ok" },
    { time: "16:31", actor: "admin", op: "فتح تفاصيل دومين", target: "migo-egypt.io", result: "ok" },
    { time: "15:59", actor: "system", op: "فحص توفر", target: "migo-egypt.cloud", result: "ok" },
    { time: "15:40", actor: "admin", op: "تعديل سعر صرف", target: "USD/EGP", result: "ok" },
    { time: "14:22", actor: "system", op: "محاولة اتصال بالمزوّد", target: "Openprovider", result: "danger" },
    { time: "13:05", actor: "admin", op: "منح صلاحية إدارة", target: "b***@example.com", result: "ok" },
    { time: "12:41", actor: "admin", op: "إيقاف تجديد تلقائي", target: "migo-egypt.shop", result: "ok" },
    { time: "11:18", actor: "system", op: "تنبيه تكلفة متغيّرة", target: ".store", result: "warn" },
    { time: "10:03", actor: "admin", op: "تسجيل خروج", target: "الجلسة", result: "ok" },
    { time: "09:47", actor: "admin", op: "دخول", target: "الجلسة", result: "ok" },
    { time: "09:12", actor: "system", op: "تشغيل اختبارات المزوّد الوهمي", target: "providers/", result: "ok" }
  ];
})();
