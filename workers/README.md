# workers/

نقاط الـAPI على Cloudflare Workers. بتستقبل طلبات الواجهة، تتأكد من الصلاحيات
**قبل** أي منطق، وتنادي طبقة الخدمة.

## الملفات
| الملف | الدور |
|---|---|
| `src/router.js` | جدول مسارات صريح (مفيش routing ضمني) + مطابقة المعاملات |
| `src/app.js` | التطبيق: صلاحيات · ردود موحّدة · هيدرز أمان · CORS |
| `src/index.js` | ربط بيئة الـWorker بالتطبيق (المزوّد الوهمي افتراضيًا) |
| `wrangler.toml` | هيكل الإعداد — **مفيش أي سرّ** فيه |

## المسارات
| المسار | الصلاحية |
|---|---|
| `GET /health` · `POST /search` · `POST /availability` · `POST /quote` | عام |
| `POST /order` · `GET /orders` · `GET /order/:id` · `GET /domains` · `POST /payment/intent` · `POST /dns` · `GET /dns/records` · `POST /dns/records` · `GET /domain/:name` · `POST /domain/:name/lock` · `POST /domain/:name/dnssec` · `GET /domain/:name/transfer-eligibility` · `GET /domain/:name/auth-code` | تسجيل دخول |
| `POST /admin/price-preview` | **إدارة بس** (الهامش والتكلفة) |
| `POST /payment/webhook` | **توقيع إلزامي** |

**مسار واحد بس بيطلّع تكلفة مورّد أو هامش ميجو، وهو `POST /admin/price-preview`
المحمي بالإدارة. أي مسار تاني ممنوع يطلّعهم، وفيه اختبار بيتأكد من ده.**

## الأسرار
كل سرّ من `env` (Secrets)، ومفيش أي قيمة مكتوبة في الكود أو الملف. مفتاح
`Service Role` **ممنوع** يظهر في الـWorker نهائيًا (بس في طبقة الـbackend).
اختبار الأمان بيتأكد من ده آليًا.

## التشغيل
```bash
cd workers && node --test "test/*.test.js"   # 24 اختبار ناجح
```

> الحالة: **منفَّذ ومُختبَر محليًا**. النشر على Cloudflare **ممنوع** لحد موافقة
> صاحب المشروع.
