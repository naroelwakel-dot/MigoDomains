# providers/

واجهة المزوّدين الموحّدة (Adapter) + **Mock Provider** للاختبار. تتيح تغيير المزوّد دون إعادة كتابة المنصة.

الدوال الموحّدة: `checkAvailability` · `getPricing` · `registerDomain` · `renewDomain` · `transferDomain` · `getDomainDetails` · `updateNameservers` · `getDnsRecords` · `updateDnsRecords` · `deleteDnsRecord` · `getDomainExpiration`

في الاختبار: Mock أو Sandbox فقط. لا تسجيل حقيقي.

> الحالة: NOT_IMPLEMENTED (المرحلة 5).
