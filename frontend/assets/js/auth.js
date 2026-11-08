/* ==========================================================================
   Migo Domains - طبقة المصادقة (Auth) - بدون أي مكتبات خارجية
   بتكلّم Supabase Auth مباشرة عبر REST. لو مفيش إعدادات، الموديول بيبقى
   في وضع "غير مُهيّأ" وبيرجّع خطأ واضح بدل ما يفشل بصمت.
   ========================================================================== */
(function () {
  "use strict";

  var SESSION_KEY = "migo-session";

  /* الإعدادات بتتقرا وقت الاستخدام (مش وقت التحميل) عشان لو
     config.js اتحدّد بعد الموديول يبقى شغال. */
  function cfg() { return window.MIGO_AUTH || {}; }
  function base() { return String(cfg().url || "").replace(/\/+$/, ""); }
  function isConfigured() { return !!(base() && cfg().anonKey); }

  function read() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (e) { return null; } }
  function write(s) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) {} }
  function drop() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }

  function call(path, body, method) {
    if (!isConfigured()) {
      return Promise.reject(new Error("الإعدادات ناقصة: مفيش رابط مشروع ولا مفتاح عام."));
    }
    return fetch(base() + path, {
      method: method || "POST",
      headers: { "apikey": cfg().anonKey, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.text().then(function (t) {
        var d = {};
        try { d = t ? JSON.parse(t) : {}; } catch (e) { d = {}; }
        if (!r.ok) {
          throw new Error(d.error_description || d.msg || d.message || d.error || ("خطأ HTTP " + r.status));
        }
        return d;
      });
    });
  }

  function store(d) {
    if (d && d.access_token) {
      write({
        access_token: d.access_token,
        refresh_token: d.refresh_token,
        expires_at: Date.now() + (Number(d.expires_in) || 3600) * 1000,
        user: d.user
      });
    }
    return d;
  }

  window.MigoAuth = {
    isConfigured: isConfigured,

    /* إنشاء حساب بالبريد وكلمة السر */
    signUp: function (email, password, meta) {
      return call("/auth/v1/signup", { email: email, password: password, data: meta || {} });
    },

    /* تسجيل الدخول بالبريد وكلمة السر */
    signIn: function (email, password) {
      return call("/auth/v1/token?grant_type=password", { email: email, password: password }).then(store);
    },

    /* رابط سحري بدل كلمة السر */
    magicLink: function (email) {
      return call("/auth/v1/otp", { email: email, create_user: true });
    },

    /* طلب إعادة تعيين كلمة السر */
    resetPassword: function (email) {
      return call("/auth/v1/recover", { email: email });
    },

    session: read,

    user: function () { var s = read(); return s ? s.user : null; },

    isSignedIn: function () { var s = read(); return !!(s && s.access_token); },

    /* هل المستخدم الحالي إداري؟ بينادي public.is_admin() على قاعدة البيانات.
       بترجّع false لو مفيش جلسة، وبترمي خطأ لو الدالة لسه مش موجودة. */
    isAdmin: function () {
      var s = read();
      if (!isConfigured()) {
        return Promise.reject(new Error("الإعدادات ناقصة: مفيش رابط مشروع ولا مفتاح عام."));
      }
      if (!s || !s.access_token) return Promise.resolve(false);
      return fetch(base() + "/rest/v1/rpc/is_admin", {
        method: "POST",
        headers: {
          "apikey": cfg().anonKey,
          "Authorization": "Bearer " + s.access_token,
          "Content-Type": "application/json"
        },
        body: "{}"
      }).then(function (r) {
        if (!r.ok) throw new Error("تعذّر التحقق من صلاحية الإدارة (HTTP " + r.status + ")");
        return r.text().then(function (t) {
          try { return JSON.parse(t) === true; } catch (e) { return false; }
        });
      });
    },

    signOut: function () {
      var s = read();
      drop();
      if (!s || !s.access_token) return Promise.resolve();
      return call("/auth/v1/logout", null, "POST").catch(function () { return null; });
    }
  };
})();
