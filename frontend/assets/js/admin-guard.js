/* ==========================================================================
   Migo Domains - فحص صلاحية الإدارة (صفحة admin.html)
   --------------------------------------------------------------------------
   مهم: الفحص ده **شكلي**. بيقفل الواجهة بس، ومش بيحمي أي بيانات.
   الحماية الحقيقية هي RLS على قاعدة البيانات + دالة public.is_admin().

   بيفضل ساكت في 3 حالات عشان ما يعطّلش الوضع التجريبي:
     - الإعدادات ناقصة، أو مفيش جلسة (حارس الجلسة هو اللي بيتصرّف).
     - دالة is_admin لسه مش موجودة في القاعدة.
   ========================================================================== */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var A = window.MigoAuth;
    if (!A || !A.isConfigured() || !A.isSignedIn()) return;

    var shell = document.getElementById("adminShell");
    var deny = document.getElementById("adminDeny");
    var note = document.getElementById("adminCheckNote");

    A.isAdmin().then(function (ok) {
      if (ok) return;
      if (shell) shell.hidden = true;
      if (deny) deny.hidden = false;
    }).catch(function () {
      if (!note) return;
      note.hidden = false;
      note.textContent = "تعذّر التحقق من صلاحية الإدارة؛ جدول admins لسه مش موجود في قاعدة البيانات. الصفحة شغالة في الوضع التجريبي.";
    });
  });
})();
