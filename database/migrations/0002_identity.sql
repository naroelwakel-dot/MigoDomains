-- ==========================================================================
-- Migo Domains - 0002: الهوية والصلاحيات (profiles + admins)
-- --------------------------------------------------------------------------
-- الحالة: مكتوب للمراجعة فقط. **لم يُنفَّذ**.
-- المصدر: docs/AUTH_SETUP.md (profiles) وdocs/ADMIN_RLS_REVIEW.md (admins).
-- الملف ده هو نفس الـSQL الموصوف هناك، منظّمًا كـmigration.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1) profiles: صف واحد لكل مستخدم.
-- --------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- كل مستخدم يقرأ/يعدّل صفه هو فقط.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- مفيش سياسة insert للعميل: الصف بيتعمل بالتريجر تحت (security definer).
-- مفيش سياسة delete: الحذف عبر cascade من auth.users.

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- إنشاء الصف تلقائيًا بعد التسجيل.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (new.id, new.email,
          new.raw_user_meta_data->>'full_name',
          new.raw_user_meta_data->>'phone')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------------------------
-- 2) admins: الصلاحية في جدول منفصل مفيش عليه أي سياسة كتابة.
-- --------------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  note       text
);

alter table public.admins enable row level security;

-- سياسة قراءة واحدة: المستخدم يشوف صفه هو بس.
-- ومفيش أي سياسة insert / update / delete لأي دور:
-- مع RLS مفعّلة وغياب السياسة، الأوامر دي مرفوضة تلقائيًا على العميل.
drop policy if exists "admins_select_self" on public.admins;
create policy "admins_select_self" on public.admins
  for select using (auth.uid() = user_id);

-- --------------------------------------------------------------------------
-- 3) is_admin(): دالة مساعدة تستخدمها سياسات الجداول الجاية.
--    بدون security definer عن قصد: بتشتغل بصلاحيات اللي بيناديها.
-- --------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
