/* ==========================================================================
   Migo Domains - منطق البحث عن الدومين (صفحة search.html)
   ملاحظة مهمة: التحقق من التوفّر هنا MOCK بالكامل للتجربة بدون أي اتصال.
   لما يجهز الباك إند، تُستبدل دالة checkAvailability بنداء الـ RDAP/Registrar API.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var out = $("#sres");
  if (!out) return;

  /* --- بيانات تجريبية: الأسعار والامتدادات --- */
  var TLDS = [
    { t: "com", price: "12.99", reg: "12.99", renew: "14.99", transfer: "12.49" },
    { t: "net", price: "13.99", reg: "13.99", renew: "15.99", transfer: "13.49" },
    { t: "org", price: "11.99", reg: "11.99", renew: "13.99", transfer: "12.29" },
    { t: "io", price: "34.99", reg: "34.99", renew: "39.99", transfer: "33.99" },
    { t: "dev", price: "14.99", reg: "14.99", renew: "16.99", transfer: "14.49" },
    { t: "ai", price: "49.99", reg: "49.99", renew: "59.99", transfer: "48.99" }
  ];

  /* --- MOCK: توفّر الدومين. لا يلمس أي خدمة حقيقية. --- */
  function checkAvailability(name) {
    // أمثلة ثابتة للحالات، وأي اسم تاني بياخد حالة "متاح" افتراضيًا.
    if (/^taken/.test(name)) return { status: "taken" };
    if (/^error/.test(name)) return { status: "error" };
    return { status: "available" };
  }

  var ALT = ["migo-egypt", "migodomains", "migostore-eg", "get-migo"];

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  function renderLoading(q) {
    out.innerHTML =
      '<div class="card"><div class="row"><div class="skeleton" style="width:180px;height:22px"></div>' +
      '<span class="muted">جاري البحث عن </span><span class="mono">' + esc(q) + '</span></div>' +
      '<div class="mt-4 grid grid-3">' +
      [0, 1, 2].map(function () { return '<div class="skeleton" style="height:120px"></div>'; }).join("") +
      "</div></div>";
  }

  function priceCard(t) {
    return '<div class="card card-tight"><div class="row-between"><strong class="mono">.' + t.t + "</strong>" +
      '<span class="pill ok">متاح</span></div>' +
      '<div class="mt-2 muted" style="font-size:var(--fs-sm)">تسجيل</div>' +
      '<div class="mono" style="font-size:var(--fs-h2)">$' + t.reg + "</div>" +
      '<div class="mt-2 dim" style="font-size:var(--fs-xs)">تجديد $' + t.renew + " · نقل $" + t.transfer + "</div>" +
      '<div class="mt-4 row"><button class="btn btn-primary btn-sm" data-toast="إضافة .' + t.t + ' للسلة (تجريبي)">أضف للسلة</button>' +
      '<button class="btn btn-sm" data-toast="صفحة تفاصيل الدومين (تجريبي)">التفاصيل</button></div></div>';
  }

  function renderAvailable(q) {
    out.innerHTML =
      '<div class="card"><div class="row-between wrap-flex">' +
      '<h2 class="h2"><span class="mono">' + esc(q) + '</span> <span class="pill ok">متاح</span></h2>' +
      '<span class="dim" style="font-size:var(--fs-xs)">الأسعار توضيحية</span></div>' +
      '<p class="lead mt-2">اختار الامتداد، والسعر بيتحدّث حسب سياسة التسعير المعتمدة.</p>' +
      '<div class="mt-5 grid grid-3">' + TLDS.map(priceCard).join("") + "</div></div>" +
      '<div class="card mt-4"><strong>اللي مش بيظهر للعميل</strong>' +
      '<p class="muted mt-2" style="font-size:var(--fs-sm)">تكلفة المزوّد والهامش وقواعد التسعير الداخلية بتظهر بس في لوحة الإدارة، مش في واجهة العميل.</p></div>';
  }

  function renderTaken(q) {
    out.innerHTML =
      '<div class="card"><h2 class="h2"><span class="mono">' + esc(q) + '</span> <span class="pill danger">محجوز</span></h2>' +
      '<p class="lead mt-2">الاسم ده مش متاح للتسجيل حاليًا. جرّب امتداد تاني أو اقتراح من اللي تحت.</p>' +
      '<h3 class="h3 mt-5">اقتراحات بديلة</h3>' +
      '<div class="mt-3 row wrap-flex">' + ALT.map(function (a) {
        return '<button class="btn btn-sm" data-toast="فحص ' + a + " (تجريبي)\">" + "<span class=\"mono\">" + a + ".com</span></button>";
      }).join("") + "</div></div>";
  }

  function renderError(q) {
    out.innerHTML =
      '<div class="card"><h2 class="h2">تعذّر إتمام البحث</h2>' +
      '<p class="lead mt-2">حصلت مشكلة مؤقتة في الاتصال بخدمة التوفّر. حاول تاني بعد لحظات.</p>' +
      '<div class="mt-4 row"><button class="btn btn-primary" id="retry">إعادة المحاولة</button>' +
      '<span class="dim" style="font-size:var(--fs-xs)">لو المشكلة استمرت، جرّب امتداد تاني أو تواصل مع الدعم.</span></div>' +
      '<p class="dim mt-4" style="font-size:var(--fs-xs)">' + esc(q) + "</p></div>";
    var r = $("#retry");
    if (r) r.addEventListener("click", function () { run(q); });
  }

  function renderAlt() {
    out.innerHTML =
      '<div class="card"><h2 class="h2">جرّب <span class="mono">.com</span> أو امتداد تاني</h2>' +
      '<p class="lead mt-2">الامتداد اللي اختارته مش مدعوم حاليًا، والاقتراحات دي متاحة:</p>' +
      '<div class="mt-4 grid grid-3">' + TLDS.slice(0, 3).map(priceCard).join("") + "</div></div>";
  }

  function run(q) {
    var name = (q || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\s+/g, "-");
    if (!name) name = "migo";
    renderLoading(name);
    setTimeout(function () {
      var res = checkAvailability(name);
      if (res.status === "taken") renderTaken(name);
      else if (res.status === "error") renderError(name);
      else renderAvailable(name);
    }, 450);
  }

  /* --- ربط الفورم --- */
  var form = $("#search-form");
  var input = $("#q");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = input ? input.value : "";
      history.replaceState(null, "", "?q=" + encodeURIComponent(v));
      run(v);
    });
  }
  var params = new URLSearchParams(location.search);
  var q0 = params.get("q");
  if (q0 !== null && q0 !== "") { if (input) input.value = q0; run(q0); }
  else if (params.get("demo") === "alt") renderAlt();
})();
