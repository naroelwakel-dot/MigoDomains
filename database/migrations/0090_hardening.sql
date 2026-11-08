-- ==========================================================================
-- Migo Domains - 0090: تشديد الصلاحيات (defense in depth)
-- --------------------------------------------------------------------------
-- الحالة: مكتوب للمراجعة فقط. **لم يُنفَّذ**.
--
-- RLS لوحده كفاية نظريًا (الأساس deny)، بس بنشيل صلاحيات الكتابة من
-- anon/authenticated على الجداول الحسّاسة كطبقة تانية، عشان أي سياسة
-- تتضاف بالغلط لاحقًا ما تفتحش باب مكنش مقصود.
-- service_role بيتجاوز RLS ويفضل مسؤول عن الكتابة.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1) منع الكتابة من anon/authenticated على الجداول الحسّاسة.
--    (القراءة تفضل زي ما هي، والـRLS هو اللي بيحدد الصفوف.)
-- --------------------------------------------------------------------------
do $$
declare
  t text;
  sensitive text[] := array[
    'domain_quotes', 'order_items', 'orders',
    'payments', 'payment_webhooks',
    'pricing_rules', 'pricing_overrides', 'provider_costs',
    'providers', 'provider_accounts', 'provider_events',
    'fx_rates', 'system_settings',
    'domain_auth_codes', 'audit_logs'
  ];
begin
  foreach t in array sensitive loop
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated;', t);
  end loop;
end $$;

-- --------------------------------------------------------------------------
-- 2) الجداول اللي العميل ليه فيها كتابة مقيّدة (تحديث صفّه بس).
--    بنسيب UPDATE مسموح والـRLS بيحدّ الصفوف.
-- --------------------------------------------------------------------------
revoke insert, delete, truncate on public.customers from anon, authenticated;
revoke insert, delete, truncate on public.customer_profiles from anon, authenticated;
revoke insert, delete, truncate on public.profiles from anon, authenticated;
grant  update on public.profiles to authenticated;

-- --------------------------------------------------------------------------
-- 3) الدوال المساعدة: التنفيذ على authenticated بس (مفيش anon).
-- --------------------------------------------------------------------------
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

revoke all on function public.current_customer_id() from public;
grant execute on function public.current_customer_id() to authenticated;

-- --------------------------------------------------------------------------
-- 4) عرض عرض العميل: القراءة من الـview بس.
-- --------------------------------------------------------------------------
revoke all on public.domain_quotes_client from anon, authenticated;
grant select on public.domain_quotes_client to authenticated;

-- --------------------------------------------------------------------------
-- ملاحظة أخيرة: أي جدول جديد يتضاف بعد كده لازم يتغطّى بنفس القواعد
-- (RLS مفعّلة · سياسة صريحة · شيل صلاحيات الكتابة من anon/authenticated).
-- ==========================================================================
