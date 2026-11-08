/* ==========================================================================
   Migo Domains - سلوكيات مشتركة بين كل الصفحات
   بدون أي مكتبات. كل عنصر بيتفعّل لو موجود في الصفحة بس.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* --- تبديل الاتجاه (RTL/LTR) + اللغة، ومحفوظ في المتصفح --- */
  var DIR_KEY = "migo-dir";
  function applyDir(dir) {
    var ltr = dir === "ltr";
    document.documentElement.setAttribute("dir", ltr ? "ltr" : "rtl");
    document.documentElement.setAttribute("lang", ltr ? "en" : "ar");
    $$("[data-dir-toggle]").forEach(function (b) {
      b.textContent = ltr ? "AR / RTL" : "EN / LTR";
      b.setAttribute("aria-pressed", String(ltr));
    });
  }
  try { applyDir(localStorage.getItem(DIR_KEY) || "rtl"); } catch (e) { applyDir("rtl"); }
  $$("[data-dir-toggle]").forEach(function (b) {
    b.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("dir") === "ltr" ? "rtl" : "ltr";
      applyDir(next);
      try { localStorage.setItem(DIR_KEY, next); } catch (e) {}
    });
  });

  /* --- قائمة الهاتف --- */
  $$("[data-nav-toggle]").forEach(function (btn) {
    var nav = $($(btn).getAttribute("data-nav-toggle"));
    if (!nav) return;
    btn.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("keydown", function (e) { if (e.key === "Escape") { nav.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); btn.focus(); } });
  });

  /* --- التبويبات: [data-tabs] > buttons[data-tab] + [data-panel] --- */
  $$("[data-tabs]").forEach(function (root) {
    var tabs = $$("[data-tab]", root);
    var panels = $$("[data-panel]", root);
    function select(name) {
      tabs.forEach(function (t) {
        var on = t.getAttribute("data-tab") === name;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
      });
      panels.forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== name; });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { select(t.getAttribute("data-tab")); });
      t.addEventListener("keydown", function (e) {
        var d = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
        if (!d) return;
        e.preventDefault();
        var n = tabs[(i + d + tabs.length) % tabs.length];
        n.focus(); select(n.getAttribute("data-tab"));
      });
    });
    if (tabs[0]) select(tabs[0].getAttribute("data-tab"));
  });

  /* --- Toast --- */
  function host() {
    var h = $(".toast-host");
    if (!h) { h = document.createElement("div"); h.className = "toast-host"; document.body.appendChild(h); }
    return h;
  }
  window.migoToast = function (msg, kind) {
    var el = document.createElement("div");
    el.className = "toast" + (kind ? " " + kind : "");
    el.setAttribute("role", "status");
    el.textContent = msg;
    host().appendChild(el);
    setTimeout(function () { el.remove(); }, 3600);
  };
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-toast]");
    if (!b) return;
    e.preventDefault();
    window.migoToast(b.getAttribute("data-toast"), b.getAttribute("data-toast-kind") || "");
  });

  /* --- Modal / Drawer: أي عنصر بـ [data-open="#id"] يفتح، و[dismiss] يقفل --- */
  var lastFocus = null;
  function openLayer(el) {
    if (!el) return;
    lastFocus = document.activeElement;
    el.classList.add("open");
    var scrim = $(".scrim"); if (scrim) scrim.classList.add("open");
    document.body.style.overflow = "hidden";
    var first = el.querySelector("button, [href], input, select, textarea");
    if (first) first.focus();
  }
  function closeLayer() {
    $$(".modal.open, .drawer.open").forEach(function (el) { el.classList.remove("open"); });
    var scrim = $(".scrim"); if (scrim) scrim.classList.remove("open");
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  $$("[data-open]").forEach(function (b) {
    b.addEventListener("click", function () { openLayer($(b.getAttribute("data-open"))); });
  });
  $$("[data-dismiss]").forEach(function (b) { b.addEventListener("click", closeLayer); });
  var scrim = $(".scrim"); if (scrim) scrim.addEventListener("click", closeLayer);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeLayer(); });

  /* --- سنة الفوتر --- */
  $$("[data-year]").forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
})();
