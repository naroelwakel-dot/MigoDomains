/* ==========================================================================
   Migo Domains - مخزن السلة (محلي في المتصفح)
   --------------------------------------------------------------------------
   بيخزّن **اختيارات العميل بس** (الدومين والعملية وعدد السنوات).
   ممنوع يخزّن أي سعر: كل سعر بيتجاب من السيرفر لحظة العرض.
   ========================================================================== */
(function (root) {
  "use strict";
  var KEY = "migo-cart";

  function read() {
    try {
      var v = JSON.parse(root.localStorage.getItem(KEY) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function write(items) {
    try { root.localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {}
    return items;
  }
  function keyOf(i) { return String(i.domain) + "|" + String(i.operation || "registration"); }

  root.migoCart = {
    items: read,
    count: function () { return read().length; },
    add: function (item) {
      var items = read();
      if (!items.some(function (i) { return keyOf(i) === keyOf(item); })) items.push(item);
      return write(items);
    },
    remove: function (domain, operation) {
      return write(read().filter(function (i) { return !(i.domain === domain && (i.operation || "registration") === (operation || "registration")); }));
    },
    clear: function () { return write([]); },
    keyOf: keyOf
  };
})(typeof window !== "undefined" ? window : this);
