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
      // أرقام لاتينية عن قصد، زي باقي الواجهة (الأسعار والتواريخ بالخط الأحادي)
      return new Date(iso).toLocaleDateString("ar-EG-u-nu-latn", { day: "numeric", month: "long", year: "numeric" });
    } catch (e) { return String(iso).slice(0, 10); }
  }

  /* حالات الدومين عند المزوّد -> نص عربي */
  var DOMAIN_LABELS = {
    ACTIVE: { label: "نشط", tone: "ok" },
    REGISTERED: { label: "مسجّل", tone: "ok" },
    EXPIRED: { label: "منتهي", tone: "danger" },
    REDEMPTION_PERIOD: { label: "فترة استرداد", tone: "warn" },
    PENDING_DELETE: { label: "في طريقه للحذف", tone: "danger" },
    TRANSFER_PENDING: { label: "نقل قيد التنفيذ", tone: "info" },
    TRANSFER_COMPLETED: { label: "اتنقل", tone: "ok" },
    TRANSFER_FAILED: { label: "فشل النقل", tone: "danger" }
  };

  function notReady(tab, reason) {
    if (tab === "domains") fill("#domBody", oneRow(5, reason));
    else fill("#renBody", oneRow(3, reason));
  }

  /**
   * دومينات العميل: من `GET /domains` (طلبات مكتملة بس).
   * التجديد التلقائي مش معلوم من المزوّد، فبنكتب «غير معلوم» بدل ما نخمّن.
   */
  function renderDomains() {
    var reason = !window.migoApi || !window.migoApi.isConfigured()
      ? "خدمة المنصة مش مربوطة بعد، فمفيش دومينات نعرضها."
      : ((!window.MigoAuth || !window.MigoAuth.isSignedIn()) ? "سجّل دخولك الأول عشان تشوف دوميناتك." : null);
    if (reason) { notReady("domains", reason); notReady("renew", reason); return; }

    fill("#domBody", oneRow(5, "جاري تحميل الدومينات..."));
    fill("#renBody", oneRow(3, "جاري تحميل الدومينات..."));

    window.migoApi.listDomains().then(function (domains) {
      if (!domains.length) {
        notReady("domains", "مفيش دومينات مسجّلة على حسابك لسه. ابدأ من صفحة البحث.");
        notReady("renew", "مفيش دومينات مسجّلة على حسابك لسه.");
        return;
      }
      fill("#domBody", domains.map(function (d) {
        var st = DOMAIN_LABELS[d.status] || { label: d.status, tone: "warn" };
        return "<tr><td class=\"mono\">" + esc(d.domain) + "</td>" +
          "<td>" + pill(st.tone, st.label) + "</td>" +
          "<td>" + esc(shortDate(d.expiresAt)) + "</td>" +
          '<td class="dim">غير معلوم</td>' +
          '<td><a class="btn btn-sm" href="checkout.html">إدارة الطلب</a></td></tr>';
      }).join(""));

      fill("#renBody", domains.map(function (d) {
        return "<tr><td class=\"mono\">" + esc(d.domain) + "</td>" +
          "<td>" + esc(shortDate(d.expiresAt)) + "</td>" +
          '<td><button class="btn btn-primary btn-sm" data-renew="' + esc(d.domain) + '">جدّد الآن</button></td></tr>';
      }).join(""));
    }).catch(function (e) {
      var msg = (e && e.message) || "خطأ غير متوقع";
      notReady("domains", "تعذّر تحميل الدومينات: " + msg);
      notReady("renew", "تعذّر تحميل الدومينات: " + msg);
    });
  }

  /* التجديد: بنضيف بند تجديد للسلة، وبعدها الطلب بيتسجل من صفحة إتمام الطلب. */
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("[data-renew]") : null;
    if (!b) return;
    var name = b.getAttribute("data-renew");
    window.migoCart.add({ domain: name, operation: "renewal", years: 1 });
    if (window.migoToast) window.migoToast("تمت إضافة تجديد " + name + " للسلة");
  });

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

  renderDomains();
  renderOrders();
})();
