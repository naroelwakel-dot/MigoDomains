/* ==========================================================================
   Migo Domains — الواجهة العامة لطبقة الخدمة
   --------------------------------------------------------------------------
   نقطة الاستيراد الوحيدة. المفروض الـWorkers تنادي من هنا بس، ومتناديش
   ملفات lib/ الداخلية مباشرة، عشان نقدر نعيد التنظيم من غير كسر.
   ========================================================================== */

export { createBackendService } from "./service.js";
export { ServiceError, SERVICE_ERROR_CODES, statusForCode } from "./errors.js";
export { createAuditLog } from "./audit.js";
export { createIdempotencyStore, fingerprint } from "./idempotency.js";
export { createAuthz } from "./authz.js";
export { createPaymentGateway, PAYMENT_STATUSES } from "./payments.js";
export { ORDER_STATUSES, ORDER_TRANSITIONS, canTransition, assertTransition, isTerminal } from "./orders.js";
