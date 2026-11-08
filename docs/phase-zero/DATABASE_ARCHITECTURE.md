# معمارية قاعدة البيانات — Migo Domains

**الحالة: NOT_IMPLEMENTED.** لا migrations على أي قاعدة بيانات فعلية في هذه المرحلة.

## الكيانات المطلوبة (25)

| المجموعة | الكيانات |
|---|---|
| العملاء والملكية | `customers` · `customer_profiles` · `registrant_profiles` |
| الامتدادات والمزوّدون | `domain_tlds` · `provider_accounts` · `provider_costs` · `provider_events` |
| التسعير | `pricing_rules` · `pricing_overrides` · `fx_rates` · `dns_plans` |
| العروض والأوامر | `domain_quotes` · `orders` · `order_items` |
| الدفع | `payments` · `payment_webhooks` |
| الدومينات | `customer_domains` · `domain_contacts` · `domain_registrations` · `domain_transfers` · `domain_renewals` |
| DNS | `dns_zones` · `dns_records` |
| التدقيق | `audit_logs` |

## دمج/فصل مقترح (مبرَّر)

- **`orders` + `order_items` منفصلان:** طلب واحد قد يحمل أكثر من بند (دومين + DNS)، والفصل يمنع تكرار منطق التسعير.
- **`registrant_profiles` منفصل عن `customer_profiles`:** بيانات المالك القانونية (Registrant) لها متطلبات امتداد مختلفة، وتُمرَّر للمزوّد؛ بيانات العميل تخصّ الحساب. الخلط يخالف قاعدة «بيانات المالك الحقيقية».
- **`domain_contacts` منفصل:** يحمل Owner/Admin/Tech/Billing لكل دومين، ويعكس ما يمرّره المزوّد فعلًا.
- **`payment_webhooks` منفصل عن `payments`:** حفظ كل Webhook حتى المكرر والمزيّف لأغراض التدقيق و Idempotency.
- **`provider_events` منفصل:** سجل أحداث المزوّد الخام (ردود الـ API، الأخطاء، Timeouts) لأجل Reconciliation.
- **`domain_registrations` منفصل عن `customer_domains`:** الأولى سجل العملية (رقم الطلب لدى المزوّد، النتيجة، الإثبات)، والثانية الكيان الحالي للدومين.

## قواعد إلزامية

- `domain_quotes` يخزّن **لقطة تسعير غير قابلة للتغيير**؛ تعديل أسعار المورّد أو FX لا يغيّر عرضًا قديمًا.
- Foreign Keys · Unique Constraints · Check Constraints · Indexes.
- `created_at` / `updated_at` على كل جدول.
- `audit_logs` لكل تغيير في الأسعار والصلاحيات والملكية والطلبات.
- Migrations منظّمة قابلة لإعادة التشغيل بأمان.

### Unique Constraints لمفاتيح العمليات (منع التكرار)

| الجدول | Unique | الغرض |
|---|---|---|
| `domain_registrations` | `UNIQUE(provider_account_id, provider_registration_id)` | منع تسجيل نفس العملية مرتين |
| `domain_registrations` | `UNIQUE(order_item_id)` | بند واحد ⇒ تسجيل واحد |
| `domain_transfers` | `UNIQUE(provider_account_id, provider_transfer_id)` | منع نقل مكرر |
| `domain_renewals` | `UNIQUE(provider_account_id, provider_renewal_id)` | منع تجديد مكرر |
| `payments` | `UNIQUE(gateway, gateway_payment_id)` | منع صف دفع مكرر |
| `payment_webhooks` | `UNIQUE(gateway, event_id)` | Idempotency: نفس الحدث يتخزّن مرة واحدة |
| `provider_events` | `UNIQUE(provider_account_id, provider_event_id)` | منع تكرار أحداث المزوّد |
| `orders` | `UNIQUE(idempotency_key)` | منع إنشاء طلب مكرر لنفس المحاولة |

### حماية Webhooks وProvider Events (منع تسريب بيانات المالك/Auth Codes)

- `payment_webhooks` و`provider_events` **ممنوع** يخزّنوا: Auth/EPP Codes · أرقام بطاقات · بيانات مالك كاملة غير مشفّرة. الحقول الحساسة تُخزَّن **مشفّرة** أو تُحذف قبل الحفظ (redaction)، ويُحفظ **مرجع** بس.
- كل صف يحمل: المزوّد · نوع الحدث · التوقيع/التحقق · الحالة · وقت المعالجة · سبب الفشل.
- القراءة: **Backend/الإدارة فقط**؛ العميل مايشوفش السجلات الخام.
- Auth Codes **ممنوعة** في أي جدول للقراءة العامة؛ تُخزَّن مشفّرة وبتدقيق عند كل ظهور (راجع `SECURITY_ARCHITECTURE.md`).

## الأمان (RLS لكل جدول حساس)

- RLS على كل جدول حساس.
- فصل صلاحيات العميل عن الإدارة.
- منع العميل من قراءة بيانات الآخرين.
- حماية Registrant Data.
- تشفير البيانات الحساسة عند الحاجة.
- **ممنوع** حفظ API Secrets في جداول مكشوفة.
- **ممنوع** Service Role Key في الـ Frontend.
- **ممنوع** إظهار Auth Codes إلا لصاحب الدومين بعد التحقق من هويته.
- Audit Log لكل تغيير حساس.

## مصفوفة RLS لكل جدول (SELECT / INSERT / UPDATE / DELETE حسب الدور)

**الأدوار:** `customer` (عميل) · `admin` (إدارة) · `service` (Backend/service_role، بتجاوز RLS للعمليات الداخلية). الأساس = **deny**، والسماح استثناء صريح.

| الجدول | customer | admin | service |
|---|---|---|---|
| `customers` / `customer_profiles` | S (صفّه) · U (صفّه) · لا I/D | S · I · U · D | S·I·U·D |
| `registrant_profiles` / `domain_contacts` | S (دوميناته) · لا تعديل | S · I · U · D | S·I·U·D |
| `customer_domains` | S (صفّه) | S · I · U · D | S·I·U·D |
| `domain_registrations` / `domain_transfers` / `domain_renewals` | S (صفّه) · لا كتابة | S · R فقط | S·I·U·D |
| `domain_quotes` / `orders` / `order_items` | S (صفّه) · لا تعديل | S · R | S·I·U·D |
| `payments` | S (مدفوعاته) · لا كتابة | S · R | S·I·U·D |
| `payment_webhooks` | ❌ (deny) | S · R | S·I (**لا U/D**) |
| `provider_events` | ❌ (deny) | S · R | S·I (**لا U/D**) |
| `pricing_rules` / `pricing_overrides` / `fx_rates` / `provider_costs` | ❌ (deny) | S·I·U·D | S·I·U·D |
| `dns_zones` / `dns_records` | S (مناطقه) | S·I·U·D | S·I·U·D |
| `audit_logs` | ❌ (deny) | S | **I فقط** (append-only) |
| `domain_tlds` / `provider_accounts` / `dns_plans` | S (مرجعية عامة) | S·I·U·D | S·I·U·D |

- السياسة الافتراضية = **deny**، والسماح استثناء صريح.
- `service_role` يتجاوز RLS؛ **ممنوع** استخدامه في الـ Frontend أو الـ anon key.
- **Append-only:** `audit_logs` (وأحداث Webhook/Provider) **insert فقط**؛ `UPDATE`/`DELETE` **ممنوعة** حتى على `service` عبر سياسة صريحة.

## سياسة الاحتفاظ ببيانات العملاء وحذفها

| البيانات | مدة الاحتفاظ | الحذف |
|---|---|---|
| بيانات العميل/Registrant النشطة | ما دام الحساب نشطًا | عند طلب الحذف: تُجهَّل/تُحذف بعد انتهاء الالتزامات |
| سجلات التسجيل/النقل/التجديد | مدة التسجيل + سنتان | أرشفة ثم حذف |
| `payments` / `payment_webhooks` | المدة المطلوبة للمحاسبة/النزاعات (يُحدَّد قانونيًا) | لا تُحذف قبل انقضاء المدة |
| `audit_logs` | لا تُحذف (append-only) | لا تُعدَّل ولا تُحذف |
| Auth Codes | مؤقت — تُخزَّن مشفّرة وتُصفَّر بعد العملية | حذف/تصفير فوري بعد الاستخدام |

- **حق النسيان:** حذف بيانات العميل يجهّل المالك في السجلات المحتفظ بها (pseudonymisation) بدل حذف سجلات التسجيل الإلزامية.
- أي حذف يمرّ بصلاحية إدارية ويسجَّل في `audit_logs` (`retention.purge`).

## Audit Logs (تصميم)

| العمود | الوصف |
|---|---|
| `id` · `created_at` | المعرّف والوقت |
| `actor_type` · `actor_id` | `customer` / `admin` / `system` / `provider` |
| `action` | مثال: `price.update` · `owner.change` · `domain.register` · `authcode.view` · `payment.webhook` |
| `entity_type` · `entity_id` | الكيان المتأثر (دومين/طلب/سعر…) |
| `before` · `after` (JSON) | الحالة قبل/بعد للتغييرات الحساسة |
| `reason` · `ip` · `user_agent` | سبب التغيير والسياق |

**يُسجَّل إلزاميًا:** تغييرات الأسعار والهوامش · تغييرات الملكية · عمليات التسجيل/التجديد/النقل · مرات ظهور Auth Code · معالجة Webhooks. و**ممنوع** تعديل أو حذف صفوف `audit_logs`.

**ممنوع تنفيذ أي migration الآن.**
