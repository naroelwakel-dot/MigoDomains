# pricing/

محرك التسعير ونموذج الهامش المتدرّج. السياسة الكاملة في `../docs/PRICING_POLICY.md`،
وتفاصيل التنفيذ في `../docs/PRICING_ENGINE.md`.

هذا الجزء **قابل للتنفيذ والاختبار محليًا بالكامل** بدون أي مفاتيح أو وصول خارجي.

> الحالة: **IMPLEMENTED — TESTED** (المرحلة 3، 8 نوفمبر 2026).
> 72 اختبار، كلهم ناجحون. مفيش أي مفاتيح، ومفيش أي تكلفة أو سعر صرف حقيقي.

## التشغيل

```bash
node pricing/demo.js                 # عرض حي بالأرقام الرسمية
node --test pricing/test/*.test.js   # 72 اختبار
cd pricing && npm test               # نفس الاختبارات
```

## الملفات

| الملف | المسؤولية |
|---|---|
| `lib/decimal.js` | حساب عشري دقيق بـBigInt بوحدة 1e-6 دولار — لا أخطاء الفاصلة العائمة |
| `lib/tiers.js` | شرائح الهامش المعتمدة + تدقيق الفجوات والتداخلات |
| `lib/margin.js` | حساب الهامش: شرائح، تجاوزات الامتدادات، ومنع تسريب التكلفة |
| `lib/fx.js` | سعر الصرف: الطزاجة والثقة وإيقاف EGP بدون اختلاق سعر |
| `lib/cost-feed.js` | تغذية التكلفة: دورة 6 ساعات، اكتشاف التغيّر، والتنبيهات |
| `lib/quote.js` | إصدار عرض السعر، قفله، إعادة التحقق، ونسخة العميل النظيفة |
| `lib/config.js` | الإعدادات الافتراضية (وفيها المعلَّق بوضوح P2–P6) |

## الاستخدام

```js
import { issueQuote, toClientQuote, makeCostSnapshot } from "./pricing/lib/index.js";

const snapshot = makeCostSnapshot({
  wholesale: "7.99",
  source: "openprovider:price-list",
  retrievedAt: new Date(),
});

const quote = issueQuote({
  operation: "registration",
  domain: "example.com",
  tld: "com",
  snapshot,
  fx: { rate: "50.10", source: "cbe:official", fetchedAt: new Date() },
});

toClientQuote(quote); // بدون تكلفة المورّد ولا هامش Migo
```

## القواعد اللي المحرك بيفرضها

- **ممنوع** إصدار سعر بدون تكلفة موثوقة وطازجة (أقصى عمر 6 ساعات).
- **ممنوع** اختلاق سعر صرف؛ لو السعر قديم أو غير موثوق يتوقف عرض EGP ويبقى USD شغال.
- **ممنوع** ظهور تكلفة المورّد أو هامش Migo للعميل — وفيه فحص آلي بيمنع التسريب.
- عرض السعر **مجمَّد** وبيتثبّت 15 دقيقة، وإعادة التحقق قبل التسجيل بتقارن السعر الحقيقي.
- **ممنوع** تسعير دومين Premium أو تكلفة صفرية من غير قرار صريح من صاحب المشروع (P3/P5).
