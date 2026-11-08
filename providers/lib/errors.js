/* ==========================================================================
   Migo Domains — أخطاء المزوّد
   --------------------------------------------------------------------------
   كل خطأ له كود ثابت، عشان طبقة الطلبات تقدر تتصرّف من غير ما تقرأ نص رسالة.
   الرسائل عربية ومقصودة توصل للإدارة (مش للعميل مباشرة).
   ========================================================================== */

export const PROVIDER_ERROR_CODES = Object.freeze({
  // مدخلات
  DOMAIN_INVALID: "DOMAIN_INVALID",
  TLD_NOT_SUPPORTED: "TLD_NOT_SUPPORTED",
  REGISTRANT_REQUIRED: "REGISTRANT_REQUIRED",
  CONTACT_INVALID: "CONTACT_INVALID",
  NAMESERVER_INVALID: "NAMESERVER_INVALID",
  DNS_RECORD_INVALID: "DNS_RECORD_INVALID",
  DNS_RECORD_NOT_FOUND: "DNS_RECORD_NOT_FOUND",
  AUTHORITY_RECORD_IMMUTABLE: "AUTHORITY_RECORD_IMMUTABLE",

  // حالة الدومين
  DOMAIN_NOT_FOUND: "DOMAIN_NOT_FOUND",
  DOMAIN_ALREADY_REGISTERED: "DOMAIN_ALREADY_REGISTERED",
  DOMAIN_NOT_ACTIVE: "DOMAIN_NOT_ACTIVE",
  DOMAIN_EXPIRED: "DOMAIN_EXPIRED",

  // النقل
  TRANSFER_NOT_ELIGIBLE: "TRANSFER_NOT_ELIGIBLE",
  TRANSFER_LOCKED: "TRANSFER_LOCKED",
  TRANSFER_ALREADY_PENDING: "TRANSFER_ALREADY_PENDING",
  AUTH_CODE_REQUIRED: "AUTH_CODE_REQUIRED",
  AUTH_CODE_INVALID: "AUTH_CODE_INVALID",

  // القدرات والبيئة
  CAPABILITY_NOT_SUPPORTED: "CAPABILITY_NOT_SUPPORTED",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  PROVIDER_TIMEOUT: "PROVIDER_TIMEOUT",
  RATE_LIMITED: "RATE_LIMITED",

  // حماية صريحة
  MOCK_ONLY_NO_PRODUCTION: "MOCK_ONLY_NO_PRODUCTION",
});

/** خطأ مزوّد عام. */
export class ProviderError extends Error {
  constructor(message, code = "PROVIDER_ERROR", detail) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    if (detail !== undefined) this.detail = detail;
  }
  toJSON() {
    return { name: this.name, code: this.code, message: this.message, detail: this.detail ?? null };
  }
}

/** المزوّد ما بيدعمش العملية دي (مثلاً Cloudflare بلا تجديد عبر API). */
export class CapabilityError extends ProviderError {
  constructor(capability, message) {
    super(
      message || "المزوّد الحالي ما بيدعمش العملية دي: " + capability,
      PROVIDER_ERROR_CODES.CAPABILITY_NOT_SUPPORTED,
      { capability }
    );
    this.name = "CapabilityError";
    this.capability = capability;
  }
}

/** عدم أهلية النقل — دايمًا مع أسباب واضحة، والدومين يفضل زي ما هو. */
export class TransferEligibilityError extends ProviderError {
  constructor(reasons) {
    super(
      "الدومين مش مؤهّل للنقل: " + reasons.map((r) => r.message).join(" · "),
      PROVIDER_ERROR_CODES.TRANSFER_NOT_ELIGIBLE,
      { reasons }
    );
    this.name = "TransferEligibilityError";
    this.reasons = reasons;
  }
}
