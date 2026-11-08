# مخطط قاعدة البيانات — Migo Domains

> **الحالة: NOT_IMPLEMENTED** — يُبنى في المرحلة 2 (Supabase PostgreSQL).

## الجداول المستهدفة (17)

`domain_tlds` · `providers` · `provider_costs` · `pricing_rules` · `pricing_overrides` · `fx_rates` · `dns_plans` · `domain_quotes` · `customers` · `customer_domains` · `domain_orders` · `payments` · `renewals` · `domain_transfers` · `dns_records` · `audit_logs` · `system_settings`

## قواعد إلزامية

- `domain_quotes` يخزّن **لقطة تسعير غير قابلة للتغيير**؛ تعديل أسعار المورّد أو سعر الصرف لا يغيّر عرضًا قديمًا.
- Foreign Keys، Unique Constraints، Check Constraints، Indexes.
- `created_at` / `updated_at` على كل جدول.
- `audit_logs` لكل تغيير في الأسعار والصلاحيات والطلبات.
- Migrations منظّمة وقابلة لإعادة التشغيل بأمان.

## قواعد RLS

المستخدم يرى بياناته فقط؛ لا يقرأ `provider_costs` ولا `pricing_rules` الداخلية؛ ولا يعدّل أسعار البيع. المسؤول وحده يعدّل قواعد التسعير.
