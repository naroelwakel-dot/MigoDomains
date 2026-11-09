/* ==========================================================================
   Migo Domains — جدول المسارات
   --------------------------------------------------------------------------
   جدول صريح، مش routing ضمني. كل مسار بيقول: محتاج تسجيل دخول؟ ولا توقيع
   دفع؟ وده اللي بيتفحص **قبل** ما نلمس أي منطق.

   ملاحظة أمنية: المسار الوحيد اللي بيطلّع تكلفة/هامش هو
   `POST /admin/price-preview`، وده محمي بـ`auth: "admin"` وبعد كده
   بفحص `requireAdmin` جوه طبقة الخدمة. أي مسار تاني ممنوع يطلّعهم.
   ========================================================================== */

export const ROUTES = Object.freeze([
  { id: "health", method: "GET", path: "/health", auth: "none" },
  { id: "search", method: "POST", path: "/search", auth: "none" },
  { id: "availability", method: "POST", path: "/availability", auth: "none" },
  { id: "quote", method: "POST", path: "/quote", auth: "none" },
  { id: "order.create", method: "POST", path: "/order", auth: "user" },
  { id: "order.list", method: "GET", path: "/orders", auth: "user" },
  { id: "order.get", method: "GET", path: "/order/:orderId", auth: "user" },
  { id: "domains.list", method: "GET", path: "/domains", auth: "user" },
  { id: "payment.intent", method: "POST", path: "/payment/intent", auth: "user" },
  { id: "payment.webhook", method: "POST", path: "/payment/webhook", auth: "signature" },
  { id: "dns.set", method: "POST", path: "/dns", auth: "user" },
  { id: "admin.pricePreview", method: "POST", path: "/admin/price-preview", auth: "admin" },
]);

/** يطابق مسار بمعاملات (`/order/:orderId`) ويرجّع {route, params} أو null. */
export function matchRoute(method, pathname) {
  const m = String(method).toUpperCase();
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  for (const route of ROUTES) {
    if (route.method !== m) continue;
    const params = matchPath(route.path, path);
    if (params) return { route, params };
  }
  return null;
}

function matchPath(pattern, path) {
  const p = pattern.split("/").filter(Boolean);
  const a = path.split("/").filter(Boolean);
  if (p.length !== a.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}
