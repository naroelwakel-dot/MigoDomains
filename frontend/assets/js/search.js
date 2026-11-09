/* ==========================================================================
   Migo Domains - منطق البحث (صفحة search.html)
   --------------------------------------------------------------------------
   كل حاجة هنا جاية من خدمة المنصة:
     • حالة التوفّر من `/search`  -> محرك RDAP في الباك إند
     • السعر من `/quote`          -> محرك التسعير في الباك إند

   **مفيش أي سعر مكتوب في الملف ده**، ومفيش أي حالة توفّر مصطنعة.
   لو الخدمة مش مربوطة، بنقول كده صراحةً بدل ما نعرض بيانات وهمية.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var out = $("#sres");
  if (!out) return;

  /* الامتدادات المعروضة افتراضيًا. القائمة الحقيقية بتيجي من `/search`. */
  var DEFAULT_TLDS = ["com", "net", "org", "io", "dev", "app", "store"];

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }

  function renderNotConfigured() {
    out.innerHTML =
      '<div class="card"><h2 class="h2">خدمة المنصة مش مربوطة بعد</h2>' +
      '<p class="lead mt-2">صفحة البحث بقت بتعتمد على خدمة المنصة الحقيقية للتحقق من التوفّر وجلب السعر. ' +
      "وطول ما `window.MIGO_API.baseUrl` في <span class=\"mono\">config.js</span> فاضي، مفيش حاجة نعرضها.</p>" +
      '<p class="muted mt-3" style="font-size:var(--fs-sm)">مش بنعرض أسعار أو نتائج تجريبية عشان محدش ياخد قرار على بيانات مش حقيقية.</p></div>';
  }

  function renderLoading(q) {
    out.innerHTML =
      '<div class="card"><div class="row"><div class="skeleton" style="width:180px;height:22px"></div>' +
      '<span class="muted">جاري فحص </span><span class="mono">' + esc(q) + "</span></div>" +
      '<div class="mt-4 grid grid-3">' +
      [0, 1, 2].map(function () { return '<div class="skeleton" style="height:120px"></div>'; }).join("") +
      "</div></div>";
  }

  function renderFailure(message, q) {
    out.innerHTML =
      '<div class="card"><h2 class="h2">تعذّر إتمام البحث</h2>' +
      '<p class="lead mt-2">' + esc(message || "حصلت مشكلة مؤقتة.") + "</p>" +
      '<div class="mt-4"><button class="btn btn-primary" id="retry">إعادة المحاولة</button></div>' +
      '<p class="dim mt-4" style="font-size:var(--fs-xs)">' + esc(q) + "</p></div>";
    var r = $("#retry");
    if (r) r.addEventListener("click", function () { run(q); });
  }

  function resultCard(res, price) {
    var lab = window.migoApi.stateLabel(res.state);
    var available = res.state === "AVAILABLE_CONFIRMED";
    var priceHtml;
    if (!available) {
      priceHtml = '<div class="mt-3 dim" style="font-size:var(--fs-xs)">' + esc(lab.label) + "</div>";
    } else if (price && price.ok !== false) {
      var p = window.migoApi.priceSummary(price.quote);
      priceHtml = p
        ? '<div class="mono mt-2" style="font-size:var(--fs-h2)">' + esc(p.text) + "</div>"
        : '<div class="mt-2 dim" style="font-size:var(--fs-xs)">السعر بالدولار قيد التحديد</div>';
    } else {
      var why = (price && price.message) || "السعر مش متاح دلوقتي.";
      priceHtml = '<div class="mt-2 dim" style="font-size:var(--fs-xs);color:var(--warn)">' + esc(why) + "</div>";
    }
    var actions = available
      ? '<div class="mt-4 row"><button class="btn btn-primary btn-sm" data-add="' + esc(res.name) + '">أضف للسلة</button></div>'
      : "";

    return '<div class="card card-tight"><div class="row-between"><strong class="mono">.' + esc(res.tld || "") + "</strong>" +
      '<span class="pill ' + lab.tone + '">' + esc(lab.label) + "</span></div>" +
      '<div class="mt-2 mono" style="font-size:var(--fs-sm)">' + esc(res.name) + "</div>" +
      priceHtml + actions + "</div>";
  }

  function run(q) {
    var name = (q || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\s+/g, "-");
    if (!name) name = "migo";
    if (!window.migoApi || !window.migoApi.isConfigured()) { renderNotConfigured(); return; }

    var parts = name.split(".").filter(Boolean);
    var baseName = parts[0];
    var typedTld = parts.length > 1 ? parts.slice(1).join(".") : null;
    var tlds = typedTld ? [typedTld] : DEFAULT_TLDS;

    renderLoading(baseName);
    out.setAttribute("aria-busy", "true");

    window.migoApi.search([baseName], tlds)
      .then(function (results) {
        if (!results.length) throw new Error("مفيش نتائج.");
        return Promise.all(results.map(function (res) {
          if (res.state !== "AVAILABLE_CONFIRMED") return { res: res, price: null };
          return window.migoApi.quote(res.name, "registration")
            .then(function (price) { return { res: res, price: price }; })
            .catch(function (e) { return { res: res, price: { ok: false, message: e.message, code: e.code } }; });
        }));
      })
      .then(function (pairs) {
        out.setAttribute("aria-busy", "false");
        var anyAvailable = pairs.some(function (p) { return p.res.state === "AVAILABLE_CONFIRMED"; });
        var head = '<div class="card"><div class="row-between wrap-flex">' +
          '<h2 class="h2"><span class="mono">' + esc(baseName) + '</span> ' +
          (anyAvailable ? '<span class="pill ok">فيه امتدادات متاحة</span>' : '<span class="pill danger">مش متاح</span>') + "</h2>" +
          '<span class="dim" style="font-size:var(--fs-xs)">آخر فحص: ' + esc(pairs[0].res.checkedAt || "") + "</span></div>" +
          '<div class="mt-5 grid grid-3">' + pairs.map(function (p) { return resultCard(p.res, p.price); }).join("") + "</div>" +
          '<p class="dim mt-4" style="font-size:var(--fs-xs)">«متاح» هنا معناها إن RDAP مالاقاش سجل. التسجيل الفعلي بيتأكد عند المزوّد لحظة التنفيذ.</p></div>';
        out.innerHTML = head;
      })
      .catch(function (e) {
        out.setAttribute("aria-busy", "false");
        renderFailure(e && e.message, name);
      });
  }

  /* إضافة للسلة (اختيار بس، من غير أي سعر) */
  out.addEventListener("click", function (e) {
    var b = e.target.closest("[data-add]");
    if (!b) return;
    var domain = b.getAttribute("data-add");
    window.migoCart.add({ domain: domain, operation: "registration", years: 1 });
    if (window.migoToast) window.migoToast("تمت إضافة " + domain + " للسلة");
  });

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
  if (q0 !== null && q0 !== "") { if (input) input.value = q0; run(q0); } else run("migo");
})();
