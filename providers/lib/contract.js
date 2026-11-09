/* ==========================================================================
   Migo Domains — العقد الموحّد للمزوّدين (Adapter Contract)
   --------------------------------------------------------------------------
   المصدر: providers/README.md — الدوال الموحّدة.
   الهدف: تغيير المزوّد بدون إعادة كتابة المنصة.

   العقد ده **إلزامي**: أي Adapter (Openprovider لاحقًا أو Mock الآن) لازم
   ينفّذ كل الدوال المطلوبة، وإلا `assertProvider` بترمي.
   ========================================================================== */

import { ProviderError, PROVIDER_ERROR_CODES } from "./errors.js";
import { CAPABILITIES } from "./states.js";

/** الدوال الإلزامية — من providers/README.md بالحرف. */
export const REQUIRED_METHODS = Object.freeze([
  "checkAvailability",
  "getPricing",
  "registerDomain",
  "renewDomain",
  "transferDomain",
  "getDomainDetails",
  "updateNameservers",
  "getDnsRecords",
  "updateDnsRecords",
  "deleteDnsRecord",
  "getDomainExpiration",
]);

/**
 * دوال إضافية بنوصي بيها بشدة لأن دورة الحياة والمعمارية بتحتاجها.
 * غيابها مسموح (بتحذير)، لكن المنصة هتحتاجها في المراحل الجاية.
 *
 * ملاحظة على النقل الخارج (Transfer Out): مش محتاج دالة جديدة في العقد.
 * النقل الخارج = فك القفل (`setLock`) + رمز النقل (`getAuthCode`)، والمسجّل
 * المستلم هو اللي بيبدأ الطلب. `transferDomain` في العقد هي نقل **داخل**.
 */
export const RECOMMENDED_METHODS = Object.freeze([
  "capabilities",
  "checkTransferEligibility",
  "getAuthCode",
  "setLock",
  "updateContacts",
]);

/** الدوال اللي بترجّع بيانات حسّاسة (Auth Code / EPP). */
export const SENSITIVE_METHODS = Object.freeze(["getAuthCode"]);

/**
 * يتحقق إن الكائن ده Adapter سليم.
 * @returns {{ok: true, missingRecommended: string[], capabilities: object}}
 */
export function assertProvider(provider, { name = "provider" } = {}) {
  if (!provider || typeof provider !== "object") {
    throw new ProviderError("الـAdapter لازم يكون كائن: " + name, "PROVIDER_INVALID");
  }

  const missing = REQUIRED_METHODS.filter((m) => typeof provider[m] !== "function");
  if (missing.length > 0) {
    throw new ProviderError(
      "الـAdapter " + name + " ناقص دوال مطلوبة: " + missing.join(", "),
      "PROVIDER_INCOMPLETE",
      { missing }
    );
  }

  const missingRecommended = RECOMMENDED_METHODS.filter((m) => typeof provider[m] !== "function");

  let capabilities = null;
  if (typeof provider.capabilities === "function") {
    capabilities = provider.capabilities();
    const unknown = Object.keys(capabilities).filter((k) => !CAPABILITIES.includes(k));
    if (unknown.length > 0) {
      throw new ProviderError(
        "قدرات غير معروفة في " + name + ": " + unknown.join(", "),
        "CAPABILITY_UNKNOWN",
        { unknown }
      );
    }
  }

  return { ok: true, missingRecommended, capabilities };
}

/**
 * بويه على الدوال غير المدعومة: لو المزوّد أعلن قدرة = false،
 * النداء يفشل بخطأ واضح **قبل** أي محاولة تنفيذ.
 */
export function guardCapability(provider, capability, methodName) {
  if (typeof provider.capabilities !== "function") return;
  const caps = provider.capabilities();
  if (caps[capability] === false) {
    throw new ProviderError(
      "المزوّد ما بيدعمش " + capability + " — العملية " + methodName + " مرفوضة قبل التنفيذ",
      PROVIDER_ERROR_CODES.CAPABILITY_NOT_SUPPORTED,
      { capability, method: methodName }
    );
  }
}
