# providers/

واجهة المزوّدين الموحّدة (Adapter) + **Mock Provider** للاختبار. تتيح تغيير المزوّد دون إعادة كتابة المنصة.

الدوال الموحّدة: `checkAvailability` · `getPricing` · `registerDomain` · `renewDomain` · `transferDomain` · `getDomainDetails` · `updateNameservers` · `getDnsRecords` · `updateDnsRecords` · `deleteDnsRecord` · `getDomainExpiration`

في الاختبار: Mock أو Sandbox فقط. لا تسجيل حقيقي.

> الحالة: **IMPLEMENTED · TESTED** (المرحلة 5) — 66 اختبار ناجح، بدون شبكة وبدون مفاتيح.

## التشغيل

```bash
node providers/demo.js                     # عرض حي لكل التدفقات
node --test providers/test/*.test.js       # 66 اختبار
```

> **تنبيه على Node 22:** الأمر `node --test providers/test/` بالمجلد لوحده بيفشل.
> لازم الصيغة بالـglob: `node --test providers/test/*.test.js`.

## الملفات

| الملف | المسؤولية |
|---|---|
| `lib/errors.js` | أكواد الأخطاء الثابتة + `ProviderError` · `CapabilityError` · `TransferEligibilityError` |
| `lib/states.js` | حالات التوفر (8) · حالات الدومين · أقفال الـregistry · القدرات (12) · قواعد النقل |
| `lib/contract.js` | `REQUIRED_METHODS` (11) · `RECOMMENDED_METHODS` · `assertProvider` · `guardCapability` |
| `lib/mock.js` | المزوّد الوهمي الكامل — كل الحالة في الذاكرة |
| `lib/bridge.js` | توصيل تكلفة المزوّد بمحرك التسعير، مع بوابة **ممنوع سعر حقيقي من بيانات وهمية** |
| `lib/index.js` | نقطة الدخول الوحيدة |

## المبادئ اللي ماشية على المزوّد الوهمي

- **صفر شبكة وصفر مفاتيح.** كل حاجة في الذاكرة، والنتايج بتتكرر من نفس البذرة.
- **`mock: true` في كل رد،** و`meta.production = false`. ومن هنا الجسر بيمنع إصدار سعر بيع حقيقي.
- **الملكية إلزامية:** كل دومين باسم العميل الفعلي، وبيانات Migo مرفوضة كمالك.
- **Auth Code مش بيظهر في التفاصيل** أبدًا، وله دالة مستقلة مصنّفة حسّاسة.
- **الأهلية تُحسب مش تُخزَّن:** الحالة بتحكم على 60 يوم وقفل النقل وDNSSEC وHold لحظيًا.
- **الأقفال والأسرار والقدرات:** القدرة = `false` بتمنع العملية **قبل** التنفيذ.
- **حقن أعطال صريح:** `failNext` · `failAlways` · `setOutage` — مفيش مفاجآت عشوائية.

## الأسعار الوهمية

`MOCK_PRICE_LIST` أرقام **اختبار بحتة** لسبعة امتدادات (com · net · org · dev · app · io · store).
**مش** أسعار Openprovider ولا أي مزوّد حقيقي، وممنوعة تُستخدم كتكلفة أو سعر بيع.

## الخطوة الجاية

استبدال المزوّد الوهمي بـOpenprovider Adapter حقيقي — بيفضل **معلّقًا** على قرار فتح الحساب/الرسوم (C).
التفاصيل الكاملة: `../docs/MOCK_PROVIDER.md`.
