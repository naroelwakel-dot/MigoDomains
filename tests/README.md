# tests/

اختبارات على مستوى المشروع كله: **تكامل** من طرف لطرف، و**أمان** على الحواجز
نفسها. النتائج بتُسجَّل في `../docs/TEST_REPORT.md`.

## الملفات
| الملف | بيفحص إيه |
|---|---|
| `integration.test.js` | RDAP → عرض سعر → طلب → دفع → تسجيل، عبر محرك التوفر والمزوّد والتسعير والخدمة والـAPI |
| `security.test.js` | منع تسريب التكلفة/الهامش · توقيع الدفع · فصل الصلاحيات · مفيش سرّ في الإعدادات أو ملف الـWorker · RLS مفعّلة |

## التشغيل
```bash
cd tests && node --test "*.test.js"          # 16 اختبار ناجح
```

## ملخص الاختبارات في المشروع كله
| الوحدة | الأمر | ناجح |
|---|---|---|
| config | `cd config && node --test "test/*.test.js"` | 7 |
| availability | `cd availability && node --test "test/*.test.js"` | 36 |
| providers | `cd providers && node --test "test/*.test.js"` | 66 |
| pricing | `cd pricing && node --test "test/*.test.js"` | 72 |
| backend | `cd backend && node --test "test/*.test.js"` | 17 |
| workers | `cd workers && node --test "test/*.test.js"` | 15 |
| policies | `cd policies && node --test "test/*.test.js"` | 5 |
| tests | `cd tests && node --test "*.test.js"` | 16 |
| **الإجمالي** | — | **234** |

**تنبيه (Node 22):** صيغة المجلد `node --test pricing/test/` لوحدها بتفشل —
لازم الـglob: `node --test "pricing/test/*.test.js"`.

**تنبيه تاني:** `tests` مجلدها مفيهوش `test/` فرعي، فالأمر عنده
`node --test "*.test.js"` مش `test/*.test.js`.

> الحالة: **كل الاختبارات ناجحة محليًا**. المتبقّي مش اختبار كود: تطبيق
> الـmigrations على قاعدة حقيقية، وربط المزوّد الحقيقي، وتشغيل DNS حقيقي —
> وكلها **محتاجة موافقة صاحب المشروع**.
