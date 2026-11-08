# تقرير التصحيحات — Migo Domains · تصحيح أدلة المرحلة صفر (نهائي)

**التاريخ: 8 نوفمبر 2026.** جولة **تصحيحات أدلة** محدودة على تقرير المرحلة صفر. **لم تبدأ المرحلة الأولى**، ولم يُنشأ Repository ولا مشروع Supabase، ولم يُدفع مال، ولم يُسجَّل أو يُنقل دومين، ولم يُنشر شيء، ولم يُعدَّل أي مشروع قائم.

## 1) تصحيح Cloudflare Registrar API

**المسار الرسمي المُصحَّح (Transfer-in):**

```
POST /accounts/{account_id}/registrar/registrations/{domain_name}/transfer-in
GET  /accounts/{account_id}/registrar/registrations/{domain_name}/transfer-in-status
```

كان مكتوبًا قبل كده بصيغة مختصرة (`POST .../registrar/transfer-in`)، واتصحّح للمسار الرسمي الكامل.

**متطلبات النقل (Transfer-in) — موثّقة:** وجود **Zone** للحساب · **DNSSEC معطّل** للـ Zone · **ملف فواتير بوسيلة دفع افتراضية صالحة** (للنقل القابل للفوترة) · **الدومين مفتوح** عند المزوّد الحالي · **Auth/EPP Code** مشفَّر **Base64 (RFC 4648 §4)** لكل الامتدادات عدا `.uk` (بتستخدم IPS tag).

**حالات الـ Workflow و Status Polling:** الطلب الناجح يرجّع **202 Accepted**؛ التتبّع عبر status endpoint. الحالات: `pending` · `in_progress` · `action_required` · `blocked` · `succeeded` · `failed`، مع Polling على `links.self`.

**الرسوم والاسترداد:** نقل الدومين **عملية قابلة للفوترة**، تُخصم من وسيلة الدفع الافتراضية عند **نجاح** النقل (امتدادات بتسعير نقل صفري زي `.uk` بلا خصم)، و**كل عملية نقل ناجحة غير قابلة للاسترداد**. النقل **يضيف مدة** لتاريخ انتهاء الدومين (عادة سنة).

**Premium Transfers:** **غير مدعومة حاليًا** عبر هذا المسار؛ لازم الداشبورد.

**الفرق بين Transfer-in و Transfer-out:**
- **Transfer-in (إلى Cloudflare):** مدعوم عبر API **بقيود** (من 30 سبتمبر 2026).
- **Transfer-out (من Cloudflare):** **غير موجود ضمن واجهة Registrar API التي تم التحقق منها**. النقل الخارجي لسه عبر **الداشبورد** + Auth Code عند الـ registrar الجديد. **مفيش ادّعاء بالاستحالة المطلقة** — لو ظهر دليل رسمي أحدث نعيد التقييم. **مفيش ادّعاء بدعم الاتجاهين.**

**فصل متطلبات API عن متطلبات Dashboard** (اتوضّح في `PROVIDER_COMPARISON.md`): الـ API بيغطّي إنشاء الطلب + التحقق + Polling + Zone/DNSSEC؛ أما **Default Address Book/Registrant** و**إدخال Auth Code في المسار اليدوي** و**نقل Premium** و**Transfer-out** فـ **داشبورد فقط**.

**المراجع الأساسية (آخر مراجعة 2026-11-08):**
- https://developers.cloudflare.com/changelog/post/2026-09-30-registrar-transfer-api-beta/
- https://developers.cloudflare.com/api/resources/registrar/subresources/transfer_in/methods/create/
- https://developers.cloudflare.com/registrar/troubleshooting/

## 2) تدقيق شروط القبول (11)

اتستخدمت الحالات: **DOCUMENTED · TESTED · NOT RUN · NOT VERIFIED · APPROVAL REQUIRED** بالمعنى الدقيق. الجدول الكامل في `PHASE_ZERO_STATUS.md`.

**بخصوص الشرط 11:** الحالة = **TESTED_WITH_SCOPE_LIMITATION**، مسنودة بسجل قابل للمراجعة في `NO_PRODUCTION_OPERATIONS_LOG.md` (GitHub = 3 مستودعات قديمة فقط · Supabase = مشروع واحد قديم فقط · مفيش اتصال Cloudflare · مفيش حساب مزوّد · مفيش دفع). **حد النطاق:** الفحص لحظي (2026-11-08) ويغطي بس ما تراه الأدوات المتصلة. لو السجل ما كانش كافيًا، كانت الحالة هتنزل لـ **NOT VERIFIED**. والحالة موحّدة في `EXECUTIVE_SUMMARY.md` و`PHASE_ZERO_STATUS.md` وهذا الملف.

## 3) الخصوصية والمعرّفات

- اتوحّد معرّف Supabase في الملفات الداخلية على `xydgyyjpqtkmcpzbhzyf`، والمنظمة على `tahmqvouxphzccqulktn`.
- **اتشالت/اتحجبت عناوين البريد والبيانات الشخصية** من التقارير: اسم المشروع كان بيعرض **بريد المالك**، واتغيّر لوصف بدون بريد.
- **مفيش أسرار ولا Tokens ولا بيانات اتصال حساسة** في أي ملف.
- **مفيش افتراض** إن وجود اتصال Supabase يُثبت سلامة الجداول أو RLS؛ الحالة **NOT VERIFIED**.

## 4) استكمال الأدلة والملفات

- المحتوى **الكامل** للملفات الـ16 موجود بدون اختصار (ملحق `PHASE_ZERO_FINAL_AUDIT.md`).
- الفهرس (`INDEX.md`) مطابق للملفات الفعلية وكل الروابط الداخلية موجودة.
- **الملخص التنفيذي متوافق مع جدول شروط القبول** (PARTIALLY_COMPLETED).
- **التصميم المقترح موصوف كتصميم مش تنفيذ** (كل البنود `DOCUMENTED`، والاختبارات `NOT RUN`).
- **مصادر رسمية مباشرة بجانب كل ادّعاء فني**، ومعاها **تاريخ آخر مراجعة**.

## 5) سجل المصادر (آخر مراجعة 2026-11-08)

| المزوّد | مصادر رسمية | آخر مراجعة |
|---|---|---|
| OpenSRS | opensrs.com/api/overview · opensrs.com/domains/pricing · opensrs.com/join · support.opensrs.com (Horizon، Quickstart) | 2026-11-08 |
| Openprovider | docs.openprovider.com · developer.openprovider.com (xml-api-reference?group=Domain) · support.openprovider.eu (create a domain) | 2026-11-08 |
| Namecheap | namecheap.com/support/api/intro · API FAQ 9739 · methods/domains/create · methods/domains/set-contacts | 2026-11-08 |
| Cloudflare | registrar/registrar-api · changelog/post/2026-09-30-registrar-transfer-api-beta · api/.../transfer_in/methods/create · api/.../transfer_in_status/methods/get · registrar/troubleshooting · registrar/account-options/domain-contact-updates · registrar/get-started/transfer-domain-to-cloudflare · fundamentals/api/reference/deprecations | 2026-11-08 |

## 6) قرارات تحتاج موافقة صاحب المشروع

| # | القرار | الحالة |
|---|---|---|
| A | إنشاء مستودع GitHub مستقل `MigoDomains` | **EXECUTED** (8 نوفمبر 2026) — اتعمل `naroelwakel-dot/MigoDomains` · **public** (A-1) · `main` · فاضي. ممنوع رفع أي ملف قبل عرض المحتوى والموافقة |
| B | إنشاء مشروع Supabase مستقل | **EXECUTED** (8 نوفمبر 2026) — `migo-domains` · ref `ulbvpyanwbxfvpxjovkn` · منظمة `MigoAi` · `eu-central-1` · Free · `ACTIVE_HEALTHY` · فاضي |
| C | **اختيار المزوّد النهائي** | **APPROVED — Openprovider** (8 نوفمبر 2026، للتصميم والتكامل المستقبلي) |
| P1 | شرائح هامش النقل | **APPROVED** — نفس الشرائح المتدرّجة، بلا سياسة منفصلة |
| D | اعتماد بيئة Cloudflare (Pages/Workers/Secrets) | **APPROVAL REQUIRED** |
| E | بوابة الدفع (لاحقًا) | **APPROVAL REQUIRED** |
| F | فتح حساب Sandbox عند Openprovider + أي رسوم/تفعيل | **APPROVAL REQUIRED** (موافقة منفصلة) |

**قرارات A/B/C/P1 اتعمدت (8 نوفمبر 2026) — معمارية فقط.** **ممنوع** دفع رسوم/شراء اشتراكات/شحن رصيد Openprovider، ولا تسجيل/نقل دومين حقيقي، ولا نشر، ولا مفاتيح إنتاج من غير موافقة منفصلة.

## 7) اختبارات لم تُنفَّذ بعد (NOT RUN)

- تسجيل دومين اختباري من Sandbox ببيانات **مالك مختلف** لكل عميل.
- تسجيل دومينين مختلفين من **نفس حساب الموزّع** لعملاء مختلفين (إثبات تعدد العملاء).
- Transfer-in تجريبي كامل (Polling لحد `succeeded`).
- تعديل بيانات المالك بعد التسجيل (COR / trade / setContacts).
- محرك التوفر عبر RDAP حي (الإنترنت مقفول من البيئة).
- اختبارات الدفع/الاسترداد/Idempotency (مفيش بوابة دفع).
- تحقق مخطط Supabase المتصل (محجوب بفحص الأمان).

## 8) الحالة النهائية

**PARTIALLY_COMPLETED — صادقة، مش مكتملة.** المخرجات كلها `DOCUMENTED`، الاختبارات التشغيلية `NOT RUN`، مخطط Supabase المتصل `NOT VERIFIED`، وحساب المزوّد (**Openprovider**) + القرارات المعلّقة `APPROVAL REQUIRED`.

**التوقف:** بعد التسليم توقفنا وانتظرنا موافقة صاحب المشروع. **مش هنبدأ PHASE ONE.**
