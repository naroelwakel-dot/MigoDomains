/* ==========================================================================
   Migo Domains - حماية الصفحات (على حساب.html/لوجة الإدارة لاحقًا)
   - لو الإعدادات ناقصة: بتظهر ملاحظة (#guardNote) والمحتوى بيفضل ظاهر
     (الوضع التجريبي شغال عادي).
   - لو الإعدادات موجودة ومفيش جلسة: تحويل لصفحة الدخول.
   - لو فيه جلسة: بيملا [data-user-email] ويربط [data-signout].
   ========================================================================== */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var A = window.MigoAuth;

    if (!A || !A.isConfigured()) {
      var note = document.getElementById("guardNote");
      if (note) note.hidden = false;
      return;
    }

    if (!A.isSignedIn()) {
      var next = location.pathname.split("/").pop() || "account.html";
      location.replace("login.html?next=" + encodeURIComponent(next));
      return;
    }

    var slot = document.querySelector("[data-user-email]");
    if (slot) {
      var u = A.user();
      slot.textContent = (u && u.email) || "";
    }

    var out = document.querySelector("[data-signout]");
    if (out) {
      out.addEventListener("click", function () {
        A.signOut().then(function () { location.href = "index.html"; });
      });
    }

    var note2 = document.getElementById("guardNote");
    if (note2) note2.hidden = true;
  });
})();
