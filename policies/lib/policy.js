/* ==========================================================================
   Migo Domains — السياسات بصيغة قابلة للتنفيذ
   --------------------------------------------------------------------------
   السياسة المكتوبة في ملف نصي بتنُسى. هنا بنحوّلها لشروط يقدر الكود يفحصها،
   والأهم: نبلّغ المستخدم بأنه لازم يوافق عليها قبل الشراء.

   ملاحظة حالة: النصوص دي **مسودّات** (DRAFT) محتاجة مراجعة قانونية
   وموافقة صاحب المشروع. الكود بيقول كده صراحةً، مش بيدّعي إنها نافذة.
   ========================================================================== */

export const POLICY_DOCUMENTS = Object.freeze({
  terms: Object.freeze({ code: "terms", version: "0.1-draft", status: "DRAFT", file: "terms.md", requiredAtCheckout: true }),
  privacy: Object.freeze({ code: "privacy", version: "0.1-draft", status: "DRAFT", file: "privacy.md", requiredAtCheckout: true }),
  refund: Object.freeze({ code: "refund", version: "0.1-draft", status: "DRAFT", file: "refund.md", requiredAtCheckout: true }),
  "advanced-dns": Object.freeze({ code: "advanced-dns", version: "0.1-draft", status: "DRAFT", file: "advanced-dns.md", requiredAtCheckout: false }),
});

/** المستندات اللي لازم يقبلها العميل قبل إتمام أي شراء. */
export const REQUIRED_AT_CHECKOUT = Object.freeze(
  Object.values(POLICY_DOCUMENTS).filter((d) => d.requiredAtCheckout).map((d) => d.code)
);

/** هل الموافقات كافية لإتمام الشراء؟ */
export function checkConsent(accepted = {}) {
  const missing = REQUIRED_AT_CHECKOUT.filter((code) => !accepted[code]);
  return { ok: missing.length === 0, missing };
}

/** مينفعش نبيع بوثيقة سياسة حالتها مسودّة بدون تنبيه صريح. */
export function policyStatusWarning(accepted = {}) {
  const drafts = Object.values(POLICY_DOCUMENTS).filter((d) => d.status !== "FINAL" && accepted[d.code]);
  return drafts.length > 0 ? "وثائق السياسة لسه مسودّات (DRAFT) — تحتاج مراجعة واعتماد نهائي." : null;
}
