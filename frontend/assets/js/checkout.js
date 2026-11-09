/* ==========================================================================
   Migo Domains - إتمام الطلب (checkout.html)
   --------------------------------------------------------------------------
   القواعد اللي الصفحة دي ماشية عليها:
   • ملخص الطلب والأسعار: من `/quote` بتاع خدمة المنصة. مفيش رقم مكتوب هنا.
   • الإجمالي المعروض = جمع أسعار الخدمة بالجنيه، وبيتقال صراحةً إنه عرض،
     والإجمالي النهائي بيتثبّت على السيرفر لحظة إنشاء الطلب.
   • الطلب بيتسجّل على الخدمة (`/order`) بجلسة العميل، وكل بند بمفتاح منع
     تكرار خاص بيه.
   • **مفيش أي دفع** هنا. بوابة الدفع مش مربوطة، والطلب بيفضل بانتظار الدفع.
   • التسجيل الفعلي **متوقف** طول ما مستندات الشروط والخصوصية والاسترداد
     مسودة (`MIGO_CHECKOUT.policiesApproved = false`).
   ========================================================================== */
(function () {
  "use strict";

  var root = document.getElementById("checkout-app");
  if (!root) return;

  var q = function (sel) { return root.querySelector(sel); };
  var el = {
    items: q("[data-items]"),
    total: q("[data-total]"),
    notice: q("[data-notice]"),
    policyNote: q("[data-policy-note]"),
    result: q("[data-result]"),
    form: q("#pay-form"),
    agree: q("#agree"),
    payBtn: q("#payBtn")
  };

  var ORDER_LABELS = {
    AWAITING_PAYMENT: { label: "بانتظار الدفع", tone: "warn" },
    PAID: { label: "مدفوع", tone: "info" },
    FULFILLING: { label: "جاري التنفيذ", tone: "info" },
    COMPLETED: { label: "مكتمل", tone: "ok" },
    FAILED: { label: "فشل", tone: "danger" },
    MANUAL_REVIEW: { label: "مراجعة يدوية", tone: "warn" },
    REFUNDED: { label: "مسترجع", tone: "warn" },
    CANCELLED: { label: "ملغي", tone: "danger" }
  };
  var OP_LABELS = { registration: "تسجيل", renewal: "تجديد", transfer: "نقل" };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }
  function notice(html) { if (el.notice) el.notice.innerHTML = html; }
  function policyNote(html) { if (el.policyNote) el.policyNote.innerHTML = html; }
  function configured() { return !!(window.migoApi && window.migoApi.isConfigured()); }
  function checkoutCfg() { return window.MIGO_CHECKOUT || {}; }
  function policiesApproved() { return checkoutCfg().policiesApproved === true; }

  function newKey() {
    try {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    } catch (e) {}
    return "co-" + Date.now() + "-" + Math.floor(Math.random() * 1e9);
  }

  /* ------------------------------------------------------------------ */
  /* ملخص الطلب                                                          */
  /* ------------------------------------------------------------------ */

  var rows = []; // { item, priceText, egp }

  function drawItems() {
    if (!el.items) return;
    if (!rows.length) {
      el.items.innerHTML = "";
      notice('<div class="card"><h2 class="h2">سلتك فاضية</h2>' +
        '<p class="lead mt-2">اختار دومين الأول من صفحة البحث.</p>' +
        '<a class="btn btn-primary mt-4" href="search.html">ابحث عن دومين</a></div>');
      if (el.payBtn) el.payBtn.disabled = true;
      return;
    }
    el.items.innerHTML = rows.map(function (r) {
      var price = r.error
        ? '<span class="dim" style="font-size:var(--fs-xs);color:var(--warn)">' + esc(r.error) + "</span>"
        : (r.priceText ? '<span class="mono">' + esc(r.priceText) + "</span>" : '<span class="skeleton" style="display:inline-block;width:64px;height:16px"></span>');
      return '<div class="mt-2 row-between"><span class="mono">' + esc(r.item.domain) +
        ' <span class="muted">· ' + (OP_LABELS[r.item.operation] || "تسجيل") + "</span></span>" + price + "</div>";
    }).join("");

    var known = rows.filter(function (r) { return r.egp != null; });
    var pending = rows.length - known.length;
    if (el.total) {
      if (known.length === rows.length) {
        el.total.textContent = known.reduce(function (s, r) { return s + r.egp; }, 0).toFixed(2) + " ج.م";
      } else {
        el.total.textContent = pending ? "لسه بيتحسب" : "-";
      }
    }
  }

  function loadSummary() {
    if (!configured()) {
      notice('<div class="card"><h2 class="h2">خدمة المنصة مش مربوطة بعد</h2>' +
        '<p class="lead mt-2">الملخص والأسعار بيتجيبوا من الخدمة. وطول ما <span class="mono">window.MIGO_API.baseUrl</span> في ' +
        '<span class="mono">config.js</span> فاضي، مفيش حاجة تتعبّى.</p></div>');
      if (el.total) el.total.textContent = "-";
      if (el.payBtn) el.payBtn.disabled = true;
      return;
    }
    var items = (window.migoCart.items() || []);
    rows = items.map(function (item) { return { item: item, priceText: null, egp: null, error: null }; });
    drawItems();
    if (!rows.length) return;

    rows.forEach(function (r) {
      window.migoApi.quote(r.item.domain, r.item.operation || "registration").then(function (env) {
        var quote = env && env.quote;
        var p = window.migoApi.priceSummary(quote);
        if (!p) { r.error = "السعر مش متاح دلوقتي"; }
        else {
          r.priceText = p.text;
          if (p.currency === "EGP") r.egp = Number(String(quote.egp.value).replace(/,/g, ""));
        }
        drawItems();
      }).catch(function (e) {
        r.error = (e && e.code === "MOCK_NOT_A_REAL_PRICE") ? "المزوّد الحقيقي مش مربوط لسه" : ((e && e.message) || "تعذّر جلب السعر");
        drawItems();
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* تسجيل الطلب                                                         */
  /* ------------------------------------------------------------------ */

  function fieldValue(id) {
    var n = root.querySelector("#" + id);
    return n && typeof n.value === "string" ? n.value.trim() : "";
  }

  function validate() {
    var problems = [];
    if (!fieldValue("fname")) problems.push("اسم المالك مطلوب.");
    var email = fieldValue("email");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push("بريد إلكتروني صحيح مطلوب.");
    var country = fieldValue("country");
    if (!/^[A-Za-z]{2}$/.test(country)) problems.push("اختار الدولة من القايمة.");
    if (!el.agree || !el.agree.checked) problems.push("لازم توافق على الشروط وسياسة الاسترداد.");
    return problems;
  }

  function renderResult(orders) {
    if (!el.result) return;
    el.result.innerHTML = '<div class="card mt-4"><h3 class="h3">طلباتك اتسجلت</h3>' +
      orders.map(function (o) {
        var st = ORDER_LABELS[o.status] || { label: o.status, tone: "warn" };
        return '<div class="mt-3 row-between wrap-flex"><span class="mono">' + esc(o.domain || o.orderId) + "</span>" +
          '<span class="pill ' + st.tone + '">' + esc(st.label) + "</span></div>";
      }).join("") +
      '<p class="muted mt-4" style="font-size:var(--fs-sm)">الطلبات كلها <strong>مش مدفوعة</strong> وواقفة عند خطوة الدفع. ' +
      "بوابة الدفع مش مربوطة، فمفيش أي خصم حصل. أول ما تتربط، هتكمل من صفحة حسابك.</p></div>";
  }

  function submit(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    if (el.result) el.result.innerHTML = "";

    if (!configured()) { notice('<p class="muted">خدمة المنصة مش مربوطة بعد.</p>'); return; }
    if (!rows.length) { notice('<p class="muted">سلتك فاضية.</p>'); return; }

    var problems = validate();
    if (problems.length) {
      notice('<div class="card"><strong>راجع البيانات دي:</strong><ul class="mt-2">' +
        problems.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul></div>");
      return;
    }

    if (!policiesApproved()) {
      notice('<div class="card"><h3 class="h3">تسجيل الطلبات لسه مقفول</h3>' +
        '<p class="mt-2" style="font-size:var(--fs-sm)">مستندات الشروط والخصوصية والاسترداد لسه <strong>مسودة</strong>، ' +
        "ومينفعش نقبل طلب حقيقي على شروط مش معتمدة. الحساب والسعر المعروض سليمين، بس التأكيد مقفول لحد اعتماد المستندات.</p></div>");
      return;
    }

    var A = window.MigoAuth;
    if (!A || !A.isSignedIn()) {
      notice('<div class="card"><h3 class="h3">محتاج تسجيل دخول</h3>' +
        '<p class="mt-2" style="font-size:var(--fs-sm)">الطلب بيتسجل باسم صاحب الحساب، فسجّل دخولك الأول.</p>' +
        '<a class="btn btn-primary mt-3" href="login.html?next=checkout.html">تسجيل الدخول</a></div>');
      return;
    }

    var registrant = {
      name: fieldValue("fname"),
      email: fieldValue("email"),
      country: fieldValue("country").toUpperCase()
    };

    if (el.payBtn) el.payBtn.disabled = true;
    notice('<p class="muted">جاري تسجيل الطلبات...</p>');

    var created = [];
    var chain = Promise.resolve();
    rows.forEach(function (r) {
      chain = chain.then(function () {
        return window.migoApi.createOrder({
          domain: r.item.domain,
          operation: r.item.operation || "registration",
          years: r.item.years || 1,
          registrant: registrant,
          idempotencyKey: newKey()
        }).then(function (order) {
          created.push({ orderId: order.orderId, domain: r.item.domain, status: order.status });
          window.migoCart.remove(r.item.domain, r.item.operation);
        });
      });
    });

    chain.then(function () {
      notice("");
      renderResult(created);
      rows = [];
      drawItems();
    }).catch(function (e) {
      if (el.payBtn) el.payBtn.disabled = false;
      var msg = (e && e.message) || "تعذّر تسجيل الطلب.";
      notice('<div class="card"><h3 class="h3">الطلب ما اتسجلش</h3>' +
        '<p class="mt-2" style="font-size:var(--fs-sm)">' + esc(msg) + "</p>" +
        (e && e.code ? '<p class="dim mt-2" style="font-size:var(--fs-xs)">كود الخطأ: <span class="mono">' + esc(e.code) + "</span></p>" : "") +
        "</div>");
    });
  }

  if (el.form) {
    el.form.addEventListener("submit", submit);
  } else if (el.payBtn) {
    el.payBtn.addEventListener("click", submit);
  }

  loadSummary();

  /* حالة المستندات: بنوضّحها من غير ما نستنى ضغطة */
  if (configured() && !policiesApproved()) {
    policyNote('<div class="card card-tight"><strong style="font-size:var(--fs-sm)">التأكيد مقفول مؤقتًا:</strong> ' +
      '<span class="muted" style="font-size:var(--fs-sm)">مستندات الشروط والخصوصية والاسترداد لسه مسودة. ' +
      "تقدر تراجع الملخص، والتأكيد هيفتح لما تتعتمد.</span></div>");
  }
})();
