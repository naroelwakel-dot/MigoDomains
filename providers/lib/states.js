/* ==========================================================================
   Migo Domains — حالات وقدرات محايدة للمزوّد
   --------------------------------------------------------------------------
   المصادر: availability/README.md · docs/phase-zero/DOMAIN_LIFECYCLE.md ·
            docs/phase-zero/REGISTRAR_OWNERSHIP_CAPABILITIES.md
   ========================================================================== */

/** حالات نتيجة التحقق من التوفر — من availability/README.md بالحرف. */
export const AVAILABILITY_STATES = Object.freeze({
  AVAILABLE_CONFIRMED: "AVAILABLE_CONFIRMED",
  REGISTERED: "REGISTERED",
  PREMIUM: "PREMIUM",
  RESERVED: "RESERVED",
  RESTRICTED: "RESTRICTED",
  UNKNOWN: "UNKNOWN",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  MANUAL_REVIEW: "MANUAL_REVIEW",
});

/**
 * قاعدة إلزامية من availability/README.md:
 * «عدم ظهور سجل لا يعني متاح؛ وعدم استجابة المصدر = UNKNOWN.»
 */
export const AVAILABILITY_IS_DEFINITIVE = Object.freeze([
  AVAILABILITY_STATES.AVAILABLE_CONFIRMED,
  AVAILABILITY_STATES.REGISTERED,
  AVAILABILITY_STATES.PREMIUM,
  AVAILABILITY_STATES.RESERVED,
]);

/**
 * حالات سجل الدومين (lifecycle + أقفال الـregistry).
 * ملاحظة: TRANSFER_LOCKED/TRANSFER_ELIGIBLE **مش** حالات — دول نتيجة حساب.
 */
export const DOMAIN_STATUSES = Object.freeze({
  REGISTERED: "REGISTERED",
  ACTIVE: "ACTIVE",
  EXPIRED: "EXPIRED",
  REDEMPTION_PERIOD: "REDEMPTION_PERIOD",
  PENDING_DELETE: "PENDING_DELETE",
  TRANSFER_PENDING: "TRANSFER_PENDING",
  TRANSFER_COMPLETED: "TRANSFER_COMPLETED",
  TRANSFER_FAILED: "TRANSFER_FAILED",
});

/** أقفال الـregistry/registrar اللي بتأثر على النقل. */
export const REGISTRY_LOCKS = Object.freeze({
  TRANSFER_PROHIBITED: "clientTransferProhibited",
  UPDATE_PROHIBITED: "clientUpdateProhibited",
  HOLD: "clientHold",
  SERVER_HOLD: "serverHold",
});

/**
 * القدرات. المزوّد الحقيقي **لازم** يعلن قدراته بصدق.
 * مثال موثّق (docs/phase-zero/REGISTRAR_OWNERSHIP_CAPABILITIES.md):
 * Cloudflare Registrar يمرّر المالك لكل دومين، لكن **التجديد وتحديث
 * الاتصالات مش عبر API** — فلو اشتغلنا بيه لازم يعلن renew: false.
 */
export const CAPABILITIES = Object.freeze([
  "register",
  "renew",
  "restore",
  "transferIn",
  "transferOut",
  "contactsUpdate",
  "nameservers",
  "dns",
  "authCode",
  "locks",
  "dnssec",
  "perDomainRegistrant",
]);

/**
 * قواعد أهلية النقل (docs/phase-zero/DOMAIN_LIFECYCLE.md).
 * الأهلية **تُحسب** ومش تتخزّن كحالة أساسية.
 */
export const TRANSFER_RULES = Object.freeze({
  /** 60 يوم من التسجيل أو آخر نقل. */
  LOCK_WINDOW_DAYS: 60,
  /** لازم يكون فيه مالك جديد للنقل الوارد. */
  REQUIRES_REGISTRANT: true,
});

export const TRANSFER_REASON_CODES = Object.freeze({
  TRANSFER_LOCKED: "TRANSFER_LOCKED",
  WITHIN_60_DAYS: "WITHIN_60_DAYS",
  DNSSEC_ACTIVE: "DNSSEC_ACTIVE",
  BAD_STATUS: "BAD_STATUS",
  NO_REGISTRANT: "NO_REGISTRANT",
  AUTH_CODE_MISSING: "AUTH_CODE_MISSING",
});
