/* ==========================================================================
   Migo Domains - حسابي (صفحة account.html)
   --------------------------------------------------------------------------
   الطلبات بتتجاب من خدمة المنصة (`GET /orders`) بجلسة العميل.

   مفيش أي بيانات تجريبية هنا. وجدولا «دوميناتي» و«التجديد» **مش بيتعبّوا**،
   لأن خدمة المنصة لسه مفيش فيها مسار بيرجّع دومينات العميل؛ بنقول كده في
   الجدول نفسه بدل ما نحط صفوف وهمية.
   ========================================================================== */
(function () {
  "use strict";

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

  function $(sel) { return document.querySelector(sel); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }
  function pill(tone, label) { return '<span class="pill ' + tone + '">' + esc(label) + "</span>"; }
  function fill(sel, html) { var n = $(sel); if (n) n.innerHTML = html; }
  function note(html) { var n = $("[data-account-note]"); if (n) n.innerHTML = html; }
  function oneRow(cols, text) {
    return '<tr><td colspan="' + cols + '" class="dim">' + esc(text) + "</td></tr>";
  }
  function money(quote) {
    if (!window.migoApi || !window.migoApi.priceSummary) return "-";
    var p = window.migoApi.priceSummary(quote);
    return p ? p.text : "-";
  }
  function shortDate(iso) {
    if (!iso) return "-";
    try {
      return new Date(iso).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
    } catch (e) { return String(iso).slice(0, 10); }
  }

  /* الأجزاء اللي لسه مفيش ليها مسار في الخدمة */
  function renderPendingSections() {
    fill("#domBody", oneRow(5, "خدمة إدارة الدومينات لسه مش متاحة، فمفيش دومينات نعرضها هنا لسه."));
    fill("#renBody", oneRow(3, "مواعيد التجديد هتظهر هنا لما خدمة إدارة الدومينات تتفتح."));
  }

  function renderOrders() {
    if (!window.migoApi || !window.migoApi.isConfigured()) {
      fill("#ordBody", oneRow(5, "خدمة المنصة مش مربوطة بعد، فمفيش طلبات نعرضها."));
      note('<div class="card card-tight"><strong style="font-size:var(--fs-sm)">الخدمة مش مربوطة:</strong> ' +
        '<span class="muted" style="font-size:var(--fs-sm)">طلباتك هتظهر هنا لما <span class="mono">window.MIGO_API.baseUrl</span> في ' +
        '<span class="mono">config.js</span> يتظبط.</span></div>');
      return;
    }
    var A = window.MigoAuth;
    if (!A || !A.isSignedIn()) {
      fill("#ordBody", oneRow(5, "سجّل دخولك الأول عشان تشوف طلباتك."));
      return;
    }

    fill("#ordBody", oneRow(5, "جاري تحميل الطلبات..."));
    window.migoApi.listOrders().then(function (orders) {
      if (!orders.length) {
        fill("#ordBody", oneRow(5, "مفيش طلبات لسه. ابدأ من صفحة البحث."));
        return;
      }
      fill("#ordBody", orders.map(function (o) {
        var st = ORDER_LABELS[o.status] || { label: o.status, tone: "warn" };
        return "<tr><td class=\"mono\">" + esc(o.orderId) + "</td>" +
          "<td>" + esc(shortDate(o.createdAt)) + "</td>" +
          '<td class="mono">' + esc(o.domain) + ' <span class="muted">· ' + esc(OP_LABELS[o.operation] || o.operation) + "</span></td>" +
          '<td class="mono">' + esc(money(o.quote)) + "</td>" +
          "<td>" + pill(st.tone, st.label) + "</td></tr>";
      }).join(""));
    }).catch(function (e) {
      fill("#ordBody", oneRow(5, "تعذّر تحميل الطلبات."));
      note('<div class="card card-tight"><strong style="font-size:var(--fs-sm)">تعذّر تحميل الطلبات:</strong> ' +
        '<span class="muted" style="font-size:var(--fs-sm)">' + esc((e && e.message) || "خطأ غير متوقع") + "</span>" +
        (e && e.code ? ' <span class="dim mono" style="font-size:var(--fs-xs)">' + esc(e.code) + "</span>" : "") + "</div>");
    });
  }

  renderPendingSections();
  renderOrders();
})();
