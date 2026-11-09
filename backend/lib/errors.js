/* ==========================================================================
   Migo Domains — أخطاء طبقة الخدمة
   --------------------------------------------------------------------------
   كل خطأ بيطلع للعميل برمز ثابت ورسالة عامة. التفاصيل الداخلية (نص المزوّد،
   أي أرقام تكلفة) **ممنوعة** إنها تطلع من هنا.
   ========================================================================== */

export const SERVICE_ERROR_CODES = Object.freeze({
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  VALIDATION: "VALIDATION",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  QUOTE_UNAVAILABLE: "QUOTE_UNAVAILABLE",
  MOCK_NOT_A_REAL_PRICE: "MOCK_NOT_A_REAL_PRICE",
  PAYMENT_INVALID: "PAYMENT_INVALID",
  PAYMENT_AMOUNT_MISMATCH: "PAYMENT_AMOUNT_MISMATCH",
  INVALID_STATE: "INVALID_STATE",
  DOMAIN_TAKEN: "DOMAIN_TAKEN",
  PROVIDER_ERROR: "PROVIDER_ERROR",
});

export class ServiceError extends Error {
  constructor(message, code, detail = null) {
    super(message);
    this.name = "ServiceError";
    this.code = code || SERVICE_ERROR_CODES.VALIDATION;
    this.detail = detail;
  }
  toJSON() {
    return { ok: false, code: this.code, message: this.message };
  }
}

/** حالة HTTP المناسبة للرمز (تُستخدم في workers). */
export function statusForCode(code) {
  switch (code) {
    case SERVICE_ERROR_CODES.UNAUTHENTICATED:
      return 401;
    case SERVICE_ERROR_CODES.FORBIDDEN:
      return 403;
    case SERVICE_ERROR_CODES.NOT_FOUND:
      return 404;
    case SERVICE_ERROR_CODES.CONFLICT:
    case SERVICE_ERROR_CODES.IDEMPOTENCY_CONFLICT:
    case SERVICE_ERROR_CODES.DOMAIN_TAKEN:
      return 409;
    case SERVICE_ERROR_CODES.VALIDATION:
      return 400;
    case SERVICE_ERROR_CODES.PROVIDER_ERROR:
      return 502;
    default:
      return 400;
  }
}
