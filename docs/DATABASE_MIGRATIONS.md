# مخطط قاعدة البيانات كـmigrations — Migo Domains

**الحالة:** الكتابة = **DOCUMENTED** · التنفيذ على قاعدة فعلية = **NOT RUN** · الموافقة = **APPROVAL REQUIRED**.
**تاريخ الكتابة:** 8 نوفمبر 2026.

> ملفات الـmigrations مكتوبة ومراجَعة نصيًا، و**ما اتنفّذتش على أي قاعدة بيانات**.
> مشروع Supabase `migo-domains` (`ulbvpyanwbxfvpxjovkn`) لسه **فاضي**.

---

## 1) اللي اتعمل

- **11 ملف migration** في `database/migrations/` بترتيب رقمي إلزامي (شوف `database/migrations/README.md`).
- **29 جدول + view واحد**، كلهم بـ: `created_at`/`updated_at`، مفاتيح أجنبية، `UNIQUE`، `CHECK`، و`INDEXES` عند الحاجة.
- **RLS مفعّلة على كل جدول حسّاس**، والأساس deny.
- **تريجرات حماية:** `updated_at` تلقائي · منع تعديل العقود · منع تعديل سجلات السلطة · منع الكتابة العامة على السجلات.

## 2) جدول المحتوى

| # | الملف | الجداول |
|---|---|---|
| 0001 | `0001_extensions_and_helpers.sql` | `pgcrypto` · `set_updated_at()` |
| 0002 | `0002_identity.sql` | `profiles` · `admins` · `is_admin()` |
| 0010 | `0010_catalog.sql` | `providers` · `provider_accounts` · `domain_tlds` · `fx_rates` · `dns_plans` · `system_settings` |
| 0011 | `0011_pricing.sql` | `pricing_rules` · `pricing_overrides` · `provider_costs` |
| 0020 | `0020_customers.sql` | `customers` · `customer_profiles` · `registrant_profiles` |
| 0030 | `0030_quotes_orders.sql` | `domain_quotes` · `orders` · `order_items` |
| 0040 | `0040_payments.sql` | `payments` · `payment_webhooks` |
| 0050 | `0050_domains.sql` | `customer_domains` · `domain_contacts` · `domain_registrations` · `domain_transfers` · `domain_renewals` · `domain_auth_codes` |
| 0060 | `0060_dns.sql` | `dns_zones` · `dns_records` |
| 0070 | `0070_provider_events_audit.sql` | `provider_events` · `audit_logs` |
| 0090 | `0090_hardening.sql` | شيل صلاحيات الكتابة من `anon`/`authenticated` |

## 3) توحيد القائمتين (17 مقابل 25/24)

في المستودع **قائمتان مختلفتان** للجداول، والاتنين اتغطّوا بالكامل:

- `docs/DATABASE_SCHEMA.md`: **17 جدولًا**.
- `docs/phase-zero/DATABASE_ARCHITECTURE.md`: عنوانه **25 كيانًا**، لكن **الجدول فيه 24 كيانًا** بالعدّ الفعلي (الفرق رقم مش كيان؛ محتاج تأكيد من صاحب المشروع).

**الترتيب اللي مشي عليه المخطط:** الـmigrations بتغطّي **الـ24 كيانًا** من المعمارية + `profiles` و`admins` (من `docs/AUTH_SETUP.md` و`docs/ADMIN_RLS_REVIEW.md`) + `providers` و`system_settings` (من قائمة الـ17) + `domain_auth_codes` (جديد، مبرَّر تحت).

| من قائمة الـ17 | في الـmigrations |
|---|---|
| `domain_orders` | **انقسم** لـ`orders` + `order_items` (المعمارية بتبرّره: طلب واحد بأكتر من بند) |
| `renewals` | **اتسمّى** `domain_renewals` |
| الباقي | زي ما هو |
| + إضافات من المعمارية | `customer_profiles` · `registrant_profiles` · `provider_accounts` · `provider_events` · `payment_webhooks` · `domain_contacts` · `domain_registrations` · `dns_zones` · `orders` · `order_items` |
| + إضافات من توثيق المصادقة | `profiles` · `admins` |
| + إضافة جديدة | `domain_auth_codes` |

**ليه `domain_auth_codes` جدول منفصل؟** قاعدة المعمارية: «Auth Codes مؤقتة، مشفّرة، وتُصفَّر بعد العملية»، و«ممنوعة في أي جدول للقراءة العامة». RLS بتتحكم في **الصفوف مش الأعمدة**، فلو خلّينا الرمز داخل `customer_domains`، أي عميل هيقدر يقرأ صفّه ويشوف البايتات المشفّرة. الفصل في جدول منفصل **من غير أي سياسة قراءة للعميل** يقفل الباب من الأساس (نفس منطق فصل جدول `admins` عن `profiles`). الوصول الفعلي للرمز: من الـBackend بعد التحقق من هوية صاحب الدومين، وبتسجيل في `audit_logs` (`authcode.view`).

## 4) مصفوفة RLS (المنفَّذة فعليًا)

**الأدوار:** `customer` (authenticated) · `admin` (authenticated + `is_admin()`) · `service` (`service_role`، بيتجاوز RLS).

| الجدول | customer | admin | ملاحظة |
|---|---|---|---|
| `profiles` | S (صفّه) · U (صفّه) | — | الإنشاء بتريجر `security definer` |
| `admins` | S (صفّه) | — | **مفيش أي سياسة كتابة** لأي دور |
| `customers` · `customer_profiles` | S · U (صفّه) | ALL | لا I/D للعميل |
| `registrant_profiles` | S (صفّه) بس | ALL | تعديل من الإدارة فقط |
| `customer_domains` | S (صفّه) | ALL | لا كتابة للعميل |
| `domain_contacts` | S (دوميناته) | ALL | |
| `domain_registrations` · `domain_transfers` · `domain_renewals` | S (صفّه) | **R فقط** | الكتابة من الـBackend |
| `dns_zones` · `dns_records` | S (مناطقه) | ALL | سجلات السلطة محمية بتريجر |
| `domain_quotes` | ❌ (deny) | ALL | العميل يقرأ من `domain_quotes_client` بدون تكلفة/هامش |
| `orders` | S (صفّه) | ALL | |
| `order_items` | S (بنود طلباته) | ALL | |
| `payments` | S (مدفوعاته) | ALL | |
| `payment_webhooks` | ❌ | **R** | append-only · الكتابة service |
| `provider_events` | ❌ | **R** | append-only |
| `audit_logs` | ❌ | **R** | append-only |
| `pricing_rules` · `pricing_overrides` · `provider_costs` | ❌ | ALL | أرقام داخلية |
| `fx_rates` · `system_settings` | ❌ | ALL | |
| `providers` · `provider_accounts` | ❌ | ALL | بيانات تشغيلية |
| `domain_tlds` · `dns_plans` | **S (مرجعية)** | ALL | |
| `domain_auth_codes` | ❌ | **R** | مشفّر · الوصول الفعلي من الـBackend |

## 5) قواعد إلزامية مفروضة

- **`domain_quotes` لقطة غير قابلة للتغيير:** تريجر `prevent_change()` بيمنع `UPDATE`/`DELETE`. تعديل تكلفة المزوّد أو سعر الصرف **ما يغيّرش** عرضًا قديمًا.
- **النقود:** `bigint` بوحدة 1e-6 دولار في كل الجداول، مطابق لـ`pricing/lib/decimal.js`.
- **append-only:** `payment_webhooks` · `provider_events` · `audit_logs` — `insert` فقط، والمنع بتريجر صريح مش بغياب السياسة بس.
- **منع التسجيل/النقل/التجديد المكرر:** `UNIQUE(provider_account_id, provider_*)` و`UNIQUE(order_item_id)` و`UNIQUE(idempotency_key)` على الطلبات.
- **`CHECK` على الحالات:** حالات الدومين (8) · أقفال الـregistry (4) · رموز أسباب النقل (6) · حالات الطلب/الدفع/النقل/التجديد.
- **بيانات الموزّع مرفوضة كمالك:** `CHECK registrant_not_reseller` على `registrant_profiles` (مرآة لقاعدة المزوّد).
- **الملكية:** كل دومين مربوط بـ`registrant_profile_id`، و`domain_contacts` بتحمل Owner/Admin/Tech/Billing.
- **الأسرار:** مفيش أي عمود لمفتاح أو سر؛ `credentials_ref` و`key_ref` **مراجع** بس.

## 6) اللي **ما اتعملش** (حدود صريحة)

- **مفيش تنفيذ.** مفيش `psql` ولا Supabase SQL Editor اشتغل من هنا، والتطبيق على قاعدة حقيقية **محتاج موافقة**.
- **مفيش تحقّق من الصياغة على محرّك PostgreSQL حقيقي** — المراجعة نصية (توازن، أسماء، مراجع، قيود) مش تشغيل. أول تنفيذ حقيقي هو أول اختبار فعلي.
- **الـseed لسه فاضي.** ممنوع أي أسعار مورّد تجريبية تتخزّن كأسعار حقيقية.
- **مفيش تشفير فعلي للرموز من هنا:** المخطط بيشترط `ciphertext` + `key_ref`، لكن مفتاح التشفير ودورة التحويل مسؤولية الـBackend لسه.
- **مفيش سياسات على جداول مش موجودة**، ومفيش واجهة بتربط الجداول دي بالـFrontend.

## 7) الخطوة اللي محتاجة قرار

1. تأكيد **قائمة الجداول المعتمدة** (17 مقابل 24) وسدّ فرق الرقم «25».
2. الموافقة على **تنفيذ الـmigrations** بالترتيب على مشروع `migo-domains`.
3. بعد التنفيذ: `insert` أول إداري في `admins` بالبريد بتاعك (الخطوة في `docs/ADMIN_RLS_REVIEW.md`).
4. تأكيد `domain_auth_codes` كجدول منفصل (اقتراح معماري هنا، مش قرارك بعد).
