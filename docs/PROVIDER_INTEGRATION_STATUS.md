# حالة تكامل المزوّد — Openprovider

آخر تحديث: 9 نوفمبر 2026 · المصدر: التوثيق الرسمي لـOpenprovider فقط.

## الخلاصة

الأدابتر الرسمي لـOpenprovider **اتبنى برمجيًا** ومغطّى بـ**23 اختبار أوفلاين**.
المسارات والطلبات والردود كلها مأخوذة من الـOpenAPI spec الرسمي، **مش من تخمين**.
لكن **مفيش ولا نداء حقيقي اتعمل**: مفيش حساب Sandbox ولا مفاتيح، فالحالة الفعلية
هي **DOCUMENTED · TESTED_WITH_SCOPE_LIMITATION (transport وهمي) · NOT RUN (ضد خدمة حقيقية)**.

| البند | الحالة |
|---|---|
| المسارات والـschemas | DOCUMENTED (من `data/swagger.json`) |
| المصادقة وتدوير الـtoken | DOCUMENTED · TESTED محليًا (transport وهمي) |
| فحص التوفر | DOCUMENTED · TESTED محليًا · **قيم `status` الفعلية NOT VERIFIED** |
| التسعير (`getPricing`) | DOCUMENTED · TESTED محليًا |
| التسجيل / التجديد / النقل | DOCUMENTED · TESTED محليًا (بناء الطلب) · **NOT RUN** |
| التفاصيل ورمز النقل والأقفال وDNS | DOCUMENTED · TESTED محليًا |
| حساب Sandbox | **NOT RUN** — مفيش حساب ولا مفاتيح |
| عمل أي عملية مدفوعة | **ممنوعة** في كل الحالات |

## الملفات

| الملف | المسؤولية |
|---|---|
| `providers/lib/openprovider.js` | الأدابتر كامل (15 دالة) + خريطة الحالات + ترجمة الأخطاء |
| `providers/test/openprovider.test.js` | 23 اختبار أوفلاين بـtransport وهمي |

## اللي مؤكَّد من التوثيق

- **المضيف (إنتاج):** `https://api.openprovider.eu/v1` — مؤكَّد.
- **المصادقة:** `POST /auth/login` بجسم `{username, password, ip}`، والرد
  `data.token`، والاستخدام `Authorization: Bearer <token>`. التوثيق بيقول
  «التوكن صالح لمدة محدودة، خزّنه مش تعمل دخول كل مرة» — والمزود بيعمل cache
  في الذاكرة بس.
- **مغلّف الردود:** `{ code, data, desc }`، و`code === 0` معناه نجاح.
- **المسارات المستخدمة:** `/domains/check` · `/domains` · `/domains/{id}/renew`
  · `/domains/transfer` · `/domains/{id}` · `/domains/{id}/authcode`
  · `/domains/prices` · `/dns/zones/{name}` · `/dns/zones/{name}/records`.
- **الملكية:** كل دومين بياخد `owner_handle` — يعني دومين باسم العميل الفعلي.

## اللي **لسه NOT VERIFIED** (ولازم يتأكد من Sandbox قبل التشغيل)

1. **عنوان API للـSandbox.** التوثيق بيقول «وجّه التكامل على مضيف الـSandbox»،
   لكن الصفحة المقروءة ما ذكرتش المضيف صراحةً. المزوّد **مابيخمّنش**: أي بيئة
   غير إنتاجية من غير `baseUrl` مؤكَّد بترمي خطأ صريح `PROVIDER_UNAVAILABLE`
   برسالة فيها `NOT VERIFIED`.
2. **قيم `status` الفعلية في فحص التوفر.** الـspec مافيهاش enum للحقل ده.
   فالماب محافظ: `AVAILABLE_CONFIRMED` **بس** لما الـAPI يقول `free` ومن غير
   premium؛ أي قيمة تانية مبهمة = `UNKNOWN`. القرار ده مقصود — مستحيل نعلن
   دومين متاح بالغلط.
3. **هل `/domains/prices` بترجّع رسوم منفصلة.** المزوّد بيحط `feesUsd: 0` وده
   موثّق كحد صريح، لأن الـendpoint مابيرجّعش رسوم منفصلة.
4. **قيود النقل على الـSandbox.** التوثيق بيقول الـSandbox «نسخة كاملة» من غير
   رسوم، لكن مفيش تأكيد إن عمليات النقل الفعلية بتتنفّذ فيه. لازم يتفحص عمليًا.

## الحدود الأمنية المطبَّقة في الأدابتر

- ممنوع بيئة غير إنتاجية على مضيف إنتاج (`MOCK_ONLY_NO_PRODUCTION`).
- ممنوع اتصال من غير transport مُحقَن — المزوّد مابيعملش شبكة من نفسه.
- رمز النقل **ما بيظهرش** في `getDomainDetails` أبدًا، وله دالة مستقلة موسومة
  `sensitive`.
- الـtoken مابيظهرش في أي رد.
- مفيش أي مفاتيح في الملف — بتتمرّر وقت التشغيل بس.

## اللي محتاج قرار من صاحب المشروع

- فتح حساب/عضوية Openprovider (رسوم) — **موافقة منفصلة**.
- بيانات اعتماد الـSandbox (username/password) + تأكيد مضيف الـSandbox.
- بعد كده: تشغيل اختبار Sandbox حقيقي، وتحديث الحالة من NOT RUN لـTESTED.
