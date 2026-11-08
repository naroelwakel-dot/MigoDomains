# database/migrations/

Migrations منظّمة قابلة لإعادة التشغيل بأمان: الجداول، الفهارس، القيود، وسياسات RLS.

> **الحالة: كُتبت واترفعت للمراجعة — `NOT RUN`.**
> **مفيش أي تنفيذ على أي قاعدة بيانات فعلية لحد موافقة صريحة من صاحب المشروع.**

## الترتيب الإلزامي

تُنفَّذ بالترتيب الرقمي. كل ملف بيعتمد على اللي قبله.

| # | الملف | المحتوى |
|---|---|---|
| 0001 | `0001_extensions_and_helpers.sql` | `pgcrypto` · `set_updated_at()` |
| 0002 | `0002_identity.sql` | `profiles` · `admins` · `is_admin()` · تريجر إنشاء الملف الشخصي |
| 0010 | `0010_catalog.sql` | `providers` · `provider_accounts` · `domain_tlds` · `fx_rates` · `dns_plans` · `system_settings` |
| 0011 | `0011_pricing.sql` | `pricing_rules` · `pricing_overrides` · `provider_costs` |
| 0020 | `0020_customers.sql` | `customers` · `customer_profiles` · `registrant_profiles` · `current_customer_id()` |
| 0030 | `0030_quotes_orders.sql` | `domain_quotes` (لقطة ثابتة) · `orders` · `order_items` · `prevent_change()` · view عرض العميل |
| 0040 | `0040_payments.sql` | `payments` · `payment_webhooks` |
| 0050 | `0050_domains.sql` | `customer_domains` · `domain_contacts` · `domain_registrations` · `domain_transfers` · `domain_renewals` · `domain_auth_codes` |
| 0060 | `0060_dns.sql` | `dns_zones` · `dns_records` · حماية سجلات السلطة |
| 0070 | `0070_provider_events_audit.sql` | `provider_events` · `audit_logs` (append-only) |
| 0090 | `0090_hardening.sql` | شيل صلاحيات الكتابة من `anon`/`authenticated` على الجداول الحسّاسة |

## إزاي تُنفَّذ (بعد الموافقة فقط)

من Supabase SQL Editor، أو من `psql` بالرابط المباشر، بالترتيب:

```bash
# مثال (مش هيتنفّذ من هنا):
for f in database/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
```

**ممنوع** التنفيذ من بيئة التشغيل الحالية: قاعدة البيانات الحقيقية ممنوعة بدون موافقة.

## قواعد مفروضة في المخطط

- **النقود:** كل مبلغ `bigint` بوحدة 1e-6 دولار، مطابق لمحرك التسعير (`pricing/lib/decimal.js`).
- **`domain_quotes` لقطة ثابتة:** تريجر بيمنع أي `UPDATE`/`DELETE`، فتعديل تكلفة المزوّد أو سعر الصرف **ما يغيّرش** عرضًا قديمًا.
- **الأسرار ممنوعة:** مفيش عمود لمفتاح أو سر؛ `credentials_ref` و`key_ref` مراجع بس.
- **رموز النقل:** في جدول منفصل `domain_auth_codes` **مشفّر**، ومفيش أي سياسة قراءة للعميل.
- **`payment_webhooks` · `provider_events` · `audit_logs`:** append-only بترتيب صريح.
- **سجلات السلطة (NS · CAA):** تريجر بيمنع تعديلها/حذفها من مسار DNS.
- **RLS على كل جدول حسّاس:** الأساس deny، والسماح استثناء صريح.

## التفاصيل والمصفوفة الكاملة

`docs/DATABASE_MIGRATIONS.md` — فيه جرد الجداول، ومصفوفة RLS لكل دور، والفرق بين
قائمة الـ17 جدولًا في `docs/DATABASE_SCHEMA.md` وقائمة الـ25 كيانًا في
`docs/phase-zero/DATABASE_ARCHITECTURE.md` وإزاي اتوفّقوا.

## الـseed

`database/seed/` لسه فاضي. **قاعدة:** لا تُستخدم أي بيانات تجريبية كأسعار مورّد حقيقية.
