/* ==========================================================================
   Migo Domains — آلة حالات الطلب
   --------------------------------------------------------------------------
   الطلب بيمرّ بمراحل واضحة، ومفيش انتقال غير مصرّح بيه. ده اللي بيمنع
   سيناريوهات زي «تسجيل من غير دفع» أو «دفع لطلب ملغي».
   ========================================================================== */

import { ServiceError, SERVICE_ERROR_CODES } from "./errors.js";

export const ORDER_STATUSES = Object.freeze({
  AWAITING_PAYMENT: "AWAITING_PAYMENT",
  PAID: "PAID",
  FULFILLING: "FULFILLING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  MANUAL_REVIEW: "MANUAL_REVIEW",
  CANCELLED: "CANCELLED",
  REFUNDED: "REFUNDED",
});

export const ORDER_TRANSITIONS = Object.freeze({
  AWAITING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["FULFILLING", "MANUAL_REVIEW", "REFUNDED", "CANCELLED"],
  FULFILLING: ["COMPLETED", "FAILED", "MANUAL_REVIEW"],
  MANUAL_REVIEW: ["FULFILLING", "FAILED", "REFUNDED", "CANCELLED"],
  FAILED: ["REFUNDED", "CANCELLED", "MANUAL_REVIEW"],
  COMPLETED: [],
  REFUNDED: [],
  CANCELLED: [],
});

export function canTransition(from, to) {
  const allowed = ORDER_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new ServiceError("انتقال حالة غير مسموح: " + from + " → " + to, SERVICE_ERROR_CODES.INVALID_STATE, { from, to });
  }
  return true;
}

export function isTerminal(status) {
  return Array.isArray(ORDER_TRANSITIONS[status]) && ORDER_TRANSITIONS[status].length === 0;
}
