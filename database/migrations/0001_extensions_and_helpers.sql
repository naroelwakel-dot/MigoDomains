-- ==========================================================================
-- Migo Domains - 0001: الإضافات والدوال المساعدة
-- --------------------------------------------------------------------------
-- الحالة: مكتوب للمراجعة فقط. **لم يُنفَّذ** على أي قاعدة بيانات.
-- التنفيذ محتاج موافقة صريحة من صاحب المشروع (docs/DATABASE_MIGRATIONS.md).
--
-- المرجع: docs/phase-zero/DATABASE_ARCHITECTURE.md · docs/DATABASE_SCHEMA.md
-- ==========================================================================

-- ملاحظة: Supabase بيفعّل pgcrypto في مخطط extensions.
-- بنستخدمه لـgen_random_uuid (متاح أصلاً في PostgreSQL 13+، والاستدعاء هنا للأمان).
create extension if not exists pgcrypto with schema extensions;

-- --------------------------------------------------------------------------
-- trigger موحّد لـupdated_at: أي UPDATE بيحدّث العمود لوحده.
-- --------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'يحدّث updated_at تلقائيًا على UPDATE. يُربط بجداول المخطط عبر trigger.';
