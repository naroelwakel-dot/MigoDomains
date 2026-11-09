/* ==========================================================================
   Migo Domains - عميل الـ API
   --------------------------------------------------------------------------
   بيكلّم خدمة المنصة (Cloudflare Workers) وبس. قواعد:

   - العنوان بييجي من `window.MIGO_API.baseUrl`. لو فاضي، الموديول بيرجّع
     خطأ واضح («مش مربوطة بعد») بدل ما يفشل بصمت.
   - **ممنوع** أي سعر أو تكلفة محسوبة هنا. كل سعر بييجي من `/quote`، ونسخة
     العميل منها بتحتوي السعر بس (بدون تكلفة المزوّد ولا الهامش).
   - **ممنوع** أي مفتاح خدمة (service_role) في الملف ده أو أي ملف واجهة.
   - توكن الجلسة بيتقرا من `MigoAuth.session()` وبيتمرّر كـ Bearer.
   ========================================================================== */
(function (root) {
  "use strict";

  var API_VERSION = 1;

  function cfg() { return root.MIGO_API || {}; }
  function base() { return String(cfg().baseUrl || "").replace(/\/+$/, ""); }
  function isConfigured() { return !!base(); }

  function token() {
    try {
      var A = root.MigoAuth;
      var s = A && typeof A.session === "function" ? A.session() : null;
      return s && s.access_token ? s.access_token : null;
    } catch (e) { return null; }
  }

  function makeError(code, message, status) {
    var e = new Error(message || "خطأ غير متوقع");
    e.code = code || "UNKNOWN";
    if (status) e.status = status;
    return e;
  }

  function headers(extra) {
    var h = { "content-type": "application/json", "accept": "application/json" };
    var t = token();
    if (t) h.authorization = "Bearer " + t;
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) h[k] = extra[k];
    return h;
  }

  function request(method, path, opts) {
    opts = opts || {};
    if (!isConfigured()) {
      return Promise.reject(makeError("API_NOT_CONFIGURED", "خدمة المنصة مش مربوطة بعد."));
    }
    var init = { method: method, headers: headers(opts.idempotencyKey ? { "x-idempotency-key": opts.idempotencyKey } : null) };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);

    return root.fetch(base() + path, init).then(function (r) {
      return r.text().then(function (t) {
        var d = null;
        try { d = t ? JSON.parse(t) : null; } catch (e) { d = null; }
        if (!r.ok || (d && d.ok === false)) {
          var err = (d && d.error) || {};
          throw makeError(err.code || ("HTTP_" + r.status), err.message || ("خطأ HTTP " + r.status), r.status);
        }
        return d || {};
      });
    }, function () {
      throw makeError("NETWORK", "تعذّر الوصول لخدمة المنصة. راجع الاتصال وحاول تاني.");
    });
  }

  /* حالات التوفّر -> نص عربي + لون. الحالات نفسها من الباك إند، مش من هنا. */
  var STATE_LABELS = {
    AVAILABLE_CONFIRMED: { label: "متاح", tone: "ok" },
    REGISTERED: { label: "محجوز", tone: "danger" },
    PREMIUM: { label: "مميّز", tone: "warn" },
    RESERVED: { label: "محجوز من السجل", tone: "danger" },
    RESTRICTED: { label: "مقيّد", tone: "warn" },
    UNKNOWN: { label: "تعذّر التأكد", tone: "warn" },
    PROVIDER_ERROR: { label: "خطأ مؤقت", tone: "danger" },
    MANUAL_REVIEW: { label: "مراجعة يدوية", tone: "warn" }
  };

  function stateLabel(state) {
    var s = STATE_LABELS[state];
    return s || { label: "حالة غير معروفة", tone: "warn" };
  }

  /* ملخّص السعر للعرض: EGP لو متاح، وإلا USD. مفيش أي حساب هنا. */
  function priceSummary(quote) {
    if (!quote) return null;
    if (quote.egp && quote.egp.available && quote.egp.value) {
      return { text: quote.egp.value + " ج.م", currency: "EGP" };
    }
    if (quote.sale && quote.sale.usd) {
      return { text: "$" + quote.sale.usd, currency: "USD" };
    }
    return null;
  }

  root.migoApi = {
    version: API_VERSION,
    isConfigured: isConfigured,
    baseUrl: base,
    stateLabel: stateLabel,
    priceSummary: priceSummary,
    STATE_LABELS: STATE_LABELS,

    health: function () { return request("GET", "/health"); },

    /* بحث: بيرجّع حالات التوفّر بس. مفيش أي سعر هنا عن قصد. */
    search: function (names, tlds) {
      return request("POST", "/search", { body: { names: names || [], tlds: tlds || [] } }).then(function (d) {
        return d.results || [];
      });
    },

    availability: function (domain) {
      return request("POST", "/availability", { body: { domain: domain } }).then(function (d) { return d.result; });
    },

    /* عرض سعر: السعر بييجي من السيرفر. ممنوع نحسبه في المتصفح. */
    quote: function (domain, operation) {
      return request("POST", "/quote", { body: { domain: domain, operation: operation || "registration" } });
    },

    createOrder: function (input) {
      return request("POST", "/order", {
        body: {
          domain: input.domain,
          operation: input.operation || "registration",
          years: input.years || 1,
          registrant: input.registrant,
          idempotencyKey: input.idempotencyKey
        },
        idempotencyKey: input.idempotencyKey
      }).then(function (d) { return d.order; });
    },

    listOrders: function () { return request("GET", "/orders").then(function (d) { return d.orders || []; }); },

    /* دومينات العميل المسجّلة فعلاً (طلبات مكتملة بس) */
    listDomains: function () { return request("GET", "/domains").then(function (d) { return d.domains || []; }); },
    getOrder: function (orderId) { return request("GET", "/order/" + encodeURIComponent(orderId)).then(function (d) { return d.order; }); },

    paymentIntent: function (orderId) {
      return request("POST", "/payment/intent", { body: { orderId: orderId } }).then(function (d) { return d.intent; });
    },

    setNameservers: function (domain, nameservers) {
      return request("POST", "/dns", { body: { domain: domain, nameservers: nameservers } });
    }
  };
})(typeof window !== "undefined" ? window : this);
