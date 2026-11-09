/* ==========================================================================
   Migo Domains — التفويض (Authorization)
   --------------------------------------------------------------------------
   قاعدتان:
     • العميل يشوف ويعدّل **طلباته ودوميناته بس**.
     • الإدارة بس اللي توصل لعمليات الإدارة (تسعير، مزوّدون، طلبات بشرية).
   وده حاجز طبقة الخدمة؛ RLS في قاعدة البيانات حاجز تانٍ مستقل.
   ========================================================================== */

import { ServiceError, SERVICE_ERROR_CODES } from "./errors.js";

export function createAuthz({ adminIds = [] } = {}) {
  function adminList() {
    return typeof adminIds === "function" ? adminIds() : adminIds;
  }

  function isAdmin(claims) {
    if (!claims) return false;
    if (claims.role === "admin" || claims.isAdmin === true) return true;
    return Boolean(claims.sub) && adminList().includes(claims.sub);
  }

  function requireUser(claims) {
    if (!claims || !claims.sub) {
      throw new ServiceError("لازم تسجيل الدخول", SERVICE_ERROR_CODES.UNAUTHENTICATED);
    }
    return claims.sub;
  }

  function requireAdmin(claims) {
    requireUser(claims);
    if (!isAdmin(claims)) {
      throw new ServiceError("العملية دي للإدارة بس", SERVICE_ERROR_CODES.FORBIDDEN);
    }
    return claims.sub;
  }

  /** يتأكد إن مالك المورد هو نفس المستخدم (أو إنه إداري). */
  function assertOwns(claims, resource, ownerField = "customerId") {
    requireUser(claims);
    if (isAdmin(claims)) return true;
    const owner = resource ? resource[ownerField] : null;
    if (!owner || owner !== claims.sub) {
      throw new ServiceError("مالكش صلاحية على المورد ده", SERVICE_ERROR_CODES.FORBIDDEN);
    }
    return true;
  }

  return { isAdmin, requireUser, requireAdmin, assertOwns };
}
