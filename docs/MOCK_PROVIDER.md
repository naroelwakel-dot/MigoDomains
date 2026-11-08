# المزوّد الوهمي (Mock Provider) — المرحلة 5

آخر تحديث: 8 نوفمبر 2026 · الحالة: **IMPLEMENTED · TESTED**
التشغيل: `node --test providers/test/*.test.js` (**66 اختبار · 66 ناجح**) · العرض: `node providers/demo.js`

## ليه موجود

عشان نبني ونختبر **كل** تدفق التسجيل والتجديد والنقل وDNS من غير أي حساب مزوّد،
ومن غير أي رسوم، ومن غير ما نلمس أي دومين حقيقي. ومعاه درع: **مش ممكن يطلّع
سعر بيع حقيقي** من أرقامه الوهمية، ولو حاولت، بيترفض صريح.

## الشكل العام

```
providers/
├── lib/errors.js      أكواد الأخطاء + أنواع الأخطاء
├── lib/states.js      الحالات والقدرات والقواعد
├── lib/contract.js    العقد الموحّد + التحقق
├── lib/mock.js        المزوّد الوهمي
├── lib/bridge.js      الجسر مع محرك التسعير
├── lib/index.js       نقطة الدخول
├── demo.js            عرض حي
├── test/              4 ملفات اختبار
└── package.json
```

## 1) العقد الموحّد

`REQUIRED_METHODS` هي نفس الدوال الإحدى عشر المذكورة في `providers/README.md`،
و`assertProvider` بترمي `PROVIDER_INCOMPLETE` لو أي واحدة ناقصة.

| إضافي (موصى به بشدة) | ليه |
|---|---|
| `capabilities()` | إعلان صادق بقدرات المزوّد |
| `checkTransferEligibility()` | الأهلية محسوبة، مش حالة مخزّنة |
| `getAuthCode()` | سرّي — منفصل عن التفاصيل عن قصد |
| `setLock()` | قفل/فك قفل النقل |
| `setDnssec()` | مطلوب لأهلية النقل |

**القدرات (12):** `register` · `renew` · `restore` · `transferIn` · `transferOut` ·
`contactsUpdate` · `nameservers` · `dns` · `authCode` · `locks` · `dnssec` · `perDomainRegistrant`

**قاعدة عملية:** لو قدرة = `false`، العملية بتترفض **قبل** أي تنفيذ (`CAPABILITY_NOT_SUPPORTED`).
ده اللي بيحمي المسار لو مزوّد زي Cloudflare Registrar دخل (تجديده وتحديث اتصالاته
**مش** عبر الـAPI — فلو ماشي بيه، بيعلن `renew: false`).

## 2) التحقق من التوفر

`checkAvailability` بترجّع واحدة من ثمانية حالات، ومعاها `definitive`:

| الحالة | قاطعة؟ | لما |
|---|---|---|
| `AVAILABLE_CONFIRMED` | ✅ | مفيش سجل وامتداد مدعوم |
| `REGISTERED` | ✅ | مسجّل جوه المزوّد |
| `RESERVED` | ✅ | في قايمة المحجوز |
| `PREMIUM` | ✅ | في قايمة المميّز |
| `RESTRICTED` | ❌ | امتداد غير مدعوم |
| `UNKNOWN` | ❌ | المصدر **مش مستجيب** |
| `PROVIDER_ERROR` · `MANUAL_REVIEW` | ❌ | تُستخدم في الطبقات الأعلى |

**قاعدة محافظة:** «عدم ظهور سجل لا يعني متاح»، و`UNKNOWN` **مش** متاح. نفس قواعد `availability/README.md`.

## 3) التسعير والجسر مع محرك التسعير

`getPricing(name, { operation })` بترجّع **تكلفة المورّد** (جملة + رسوم) بالدولار،
وموسومة `fake: true`.

`bridge.js` بيحوّل السجل لِلقطة تكلفة يفهمها محرك التسعير:

| الوضع | اللقطة | النتيجة |
|---|---|---|
| مزوّد وهمي، بدون `allowMock` | `trusted: false` + وسم `provenance=mock` | **مرفوض:** `MOCK_NOT_A_REAL_PRICE` |
| مزوّد وهمي، بـ`allowMock: true` | `trusted: true` وبس **الوسم بيفضل** | عرض سعر، بس `localTestOnly: true` وتحذير |
| مزوّد إنتاجي (`meta.production = true`) | `trusted: true` بدون وسم | عرض سعر عادي |

يعني: الفلو كامل شغّال محليًا للتجربة، ومستحيل بالغلط يطلّع سعر حقيقي من أرقام اختبار.
والعرض للعميل (`toClientQuote`) مش فيه تكلفة ولا هامش — بيتأكد آليًا.

**مثال حقيقي من العرض:**

```
my-shop.com (registration):  8.67 USD → 11.67 USD   (شريحة 3.00 ثابت)
بالجنيه (50.10):             584.67 EGP
```

## 4) التسجيل والملكية

- المالك **إلزامي**: `REGISTRANT_REQUIRED` / `CONTACT_INVALID`.
- **بيانات Migo مرفوضة كمالك** (`RESERVED` للموزّع) — الملكية للعميل الفعلي.
- الافتراضي: `admin` و`tech` و`billing` بياخدوا المالك لو مش محدّدين.
- 2 Nameservers افتراضية، وسجلّا NS للسلطة.

**Idempotency:** نفس المفتاح + نفس الطلب = نفس النتيجة بدون تكرار؛
نفس المفتاح + طلب مختلف = `IDEMPOTENCY_CONFLICT` (ممنوع تنفيذ تاني بالغلط).

## 5) التجديد

بيمدّ التاريخ من **الأبعد** بين تاريخ الانتهاء والآن (مش من تاريخ التسجيل).
حدود: 1 لـ10 سنوات. التجديد في مرحلة **الحذف النهائي** (`PENDING_DELETE`) مرفوض
لأن المطلوب استرداد، مش تجديد.

## 6) النقل — ثلاث بوابات

1. **الرمز:** `AUTH_CODE_REQUIRED` ثم `AUTH_CODE_INVALID`.
2. **الأهلية** (`checkTransferEligibility`) — **محسوبة لحظيًا**:

| السبب | القاعدة |
|---|---|
| `WITHIN_60_DAYS` | أقل من 60 يوم من التسجيل **أو** آخر نقل |
| `TRANSFER_LOCKED` | `clientTransferProhibited` مفعّل |
| `DNSSEC_ACTIVE` | DNSSEC لازم يتقفل قبل النقل |
| `BAD_STATUS` | Hold · Redemption · Pending Delete · منقول خارجيًا |

3. **الحالة:** ممنوع نقل تاني وهو `TRANSFER_PENDING`.

النقل الناجح = **`TRANSFER_PENDING` مش مكتمل**، ومعاه `transferId`.
و`simulateTransferOutcome(id, "completed" | "failed")` بتحاكي تأكيد المزوّد:
النجاح بيمدّ سنة، والفشل بيسيب الدومين زي ما هو.

## 7) الأسرار

`getAuthCode()` هي الطريقة الوحيدة للرمز. `getDomainDetails()` بترجّع
`authCodeIncluded: false` ومفيش فيها المفتاح خالص. والقيمة كمان بتبان `sensitive: true`
مع تحذير استخدام.

## 8) DNS

- **الاستبدال كامل** مش إضافة (نفس تحذير `setHosts` عند Namecheap في `DNS_ARCHITECTURE.md`).
- **سجلات السلطة (NS · CAA) محمية:** ممنوعة تتعدّل أو تتحذف من هنا → `AUTHORITY_RECORD_IMMUTABLE`.
  تغيير الـNS له مساره الخاص: `updateNameservers`.
- تحقق كامل: النوع · القيمة (IPv4 بمدى 0-255 · AAAA) · TTL من 60 لـ86400.
- كل سجل له `id` ثابت عشان الحذف.

## 9) حقن الأعطال

`failNext(method)` · `failAlways(method)` · `setOutage(true)` · `clearFailures()`
· `reset()` · `stats()`. كلها **صريحة** — مفيش فشل عشوائي في المسار العادي.

## 10) الحتمية

كل شيء اتبنى من بذرة (`seed`): نفس البذرة = نفس المعرّفات ونفس رموز النقل. الاختبارات
بتستخدم ساعة مثبّتة كمان، فأي نتيجة بتتكرر بالحرف.

## اللي اتصمّم عن قصد إنه **مرفوض**

| الحالة | السلوك |
|---|---|
| سعر حقيقي من أرقام وهمية | ❌ `MOCK_NOT_A_REAL_PRICE` |
| تسعير Premium | ❌ القرار (P5) لسه معلّق، مفيش هامش مُختلق |
| ملكية باسم الموزّع | ❌ مرفوض |
| تعديل سجل سلطة من مسار DNS | ❌ مرفوض |
| نقل Premium عبر API | ❌ غير مدعوم (زي Cloudflare Registrar) |
| أي تسجيل حقيقي | ❌ مش موجود في الكود أصلًا |

## ما لم يُنفَّذ

- **مفيش أي اتصال بمزوّد حقيقي** ولا أي شبكة ولا أي مفتاح.
- **مفيش أي عملية إنتاجية:** لا تسجيل، لا نقل، لا نشر، لا دفع.
- **مفيش ربط بقاعدة بيانات** ولا migrations.
- **Openprovider Adapter** لسه معلّق على قرار فتح الحساب/الرسوم (C).
