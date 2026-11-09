# availability/

محرك التحقق من التوفر: RDAP أولًا، مع Cache و Rate Limiting، وتجميع نتائج
المصادر قبل القرار.

حالات النتيجة: `AVAILABLE_CONFIRMED` · `REGISTERED` · `PREMIUM` · `RESERVED` · `RESTRICTED` · `UNKNOWN` · `PROVIDER_ERROR` · `MANUAL_REVIEW`

**قواعد مفروضة:**
- عدم ظهور سجل **لا يعني** «متاح» تلقائيًا.
- عدم استجابة المصدر = `UNKNOWN` (مش متاح).
- سيرفر RDAP بيتحدّد من **ملف IANA Bootstrap الرسمي** (`data.iana.org/rdap/dns.json`)،
  ومش من `rdap.org` كمصدر وحيد.
- **Registrar Availability API هو المرجع النهائي قبل التسجيل**، ومحرك الدمج
  بيدّي كلمة الـRegistrar أولوية، والاختلاف الحاسم بين المصدرين بيروح لـ`MANUAL_REVIEW`.

## الملفات
| الملف | الدور |
|---|---|
| `lib/bootstrap.js` | قراءة مستند IANA، وربط الامتداد بسيرفر RDAP وببناء الرابط |
| `lib/rdap.js` | استعلام واحد: 404 = «متاح مؤكد»، انقطاع/مهلة = `UNKNOWN`، 5xx = `PROVIDER_ERROR` |
| `lib/cache.js` | تخزين بمدة صلاحية: الحاسم يعيش أطول، غير الحاسم ثواني |
| `lib/ratelimit.js` | Token Bucket بساعة قابلة للحقن |
| `lib/engine.js` | الواجهة: `check()` · `combine()` · `invalidate()` |
| `lib/index.js` | نقطة الاستيراد الوحيدة |

كل الشبكة **قابلة للحقن** (`fetch` بيمرّر من برّه)، فالاختبارات بتشتغل بالكامل محلي.

## التشغيل
```bash
cd availability && node --test "test/*.test.js"   # 36 اختبار ناجح
```

> الحالة: **منفَّذ ومُختبَر محليًا**. الفحص الحقيقي على شبكة الإنترنت لسه
> محتاج تشغيل من بيئة عندها وصول خارجي (بيئة الـSandbox دي مقفولة).
> ده **مش** عيب في الكود — دي حدود البيئة.
