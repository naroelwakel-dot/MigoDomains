-- ==========================================================================
-- Migo Domains - 0020: العملاء والملكية (customers · customer_profiles · registrant_profiles)
-- --------------------------------------------------------------------------
-- الحالة: مكتوب للمراجعة فقط. **لم يُنفَّذ**.
--
-- الفصل مقصود (docs/phase-zero/DATABASE_ARCHITECTURE.md):
--   customers          = الحساب
--   customer_profiles  = بيانات الحساب (عرض/تواصل)
--   registrant_profiles = بيانات المالك القانونية (Registrant) اللي بتُمرَّر للمزوّد
-- الخلط بين الاتنين بيخالف قاعدة «كل دومين باسم العميل الفعلي».
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1) customers: الحساب.
-- --------------------------------------------------------------------------
create table if not exists public.customers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid unique references auth.users(id) on delete set null,
  email      text not null,
  status     text not null default 'active'
             check (status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customers_user on public.customers(user_id);

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

-- دالة مساعدة: id العميل بتاع المستخدم الحالي (بتستخدمها سياسات الجداول الجاية).
create or replace function public.current_customer_id()
returns uuid
language sql
stable
set search_path = public
as $$
  select c.id from public.customers c where c.user_id = auth.uid() limit 1;
$$;

revoke all on function public.current_customer_id() from public;
grant execute on function public.current_customer_id() to authenticated;

-- --------------------------------------------------------------------------
-- 2) customer_profiles: بيانات الحساب.
-- --------------------------------------------------------------------------
create table if not exists public.customer_profiles (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null unique references public.customers(id) on delete cascade,
  full_name          text,
  phone              text,
  company            text,
  country            char(2),
  preferred_currency char(3) not null default 'USD' check (preferred_currency in ('USD', 'EGP')),
  locale             text not null default 'ar' check (locale in ('ar', 'en')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists trg_customer_profiles_updated_at on public.customer_profiles;
create trigger trg_customer_profiles_updated_at before update on public.customer_profiles
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3) registrant_profiles: بيانات المالك القانونية (حسّاسة).
--    ملاحظة: بيانات Migo نفسها **مرفوضة** كمالك رسمي — نفس القاعدة اللي
--    المزوّد الوهمي بيفرضها (providers/lib/mock.js · REGISTRANT_REQUIRED).
-- --------------------------------------------------------------------------
create table if not exists public.registrant_profiles (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references public.customers(id) on delete cascade,
  label          text not null default 'default',
  full_name      text not null,
  organization   text,
  email          text not null,
  phone          text not null,
  address_line1  text not null,
  address_line2  text,
  city           text not null,
  state          text,
  postal_code    text,
  country        char(2) not null,
  is_default     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (customer_id, label),
  -- ممنوع بيانات الموزّع كمالك رسمي (مرآة لقاعدة المزوّد).
  constraint registrant_not_reseller check (
    lower(full_name) not like '%migo%' and lower(full_name) not like '%naroelwakel%'
    and lower(coalesce(organization, '')) not like '%migo%'
    and lower(coalesce(organization, '')) not like '%naroelwakel%'
    and lower(email) not like '%migo%' and lower(email) not like '%naroelwakel%'
  )
);

create index if not exists idx_registrant_profiles_customer on public.registrant_profiles(customer_id);

drop trigger if exists trg_registrant_profiles_updated_at on public.registrant_profiles;
create trigger trg_registrant_profiles_updated_at before update on public.registrant_profiles
  for each row execute function public.set_updated_at();

-- ==========================================================================
-- RLS: العميل يشوف/يعدّل صفّه فقط · الإدارة الكل · مفيش insert/delete للعميل.
-- ==========================================================================
alter table public.customers           enable row level security;
alter table public.customer_profiles   enable row level security;
alter table public.registrant_profiles enable row level security;

drop policy if exists "customers_select_own" on public.customers;
create policy "customers_select_own" on public.customers
  for select using (user_id = auth.uid());

drop policy if exists "customers_update_own" on public.customers;
create policy "customers_update_own" on public.customers
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "customers_admin" on public.customers;
create policy "customers_admin" on public.customers
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "customer_profiles_select_own" on public.customer_profiles;
create policy "customer_profiles_select_own" on public.customer_profiles
  for select using (customer_id = public.current_customer_id());

drop policy if exists "customer_profiles_update_own" on public.customer_profiles;
create policy "customer_profiles_update_own" on public.customer_profiles
  for update using (customer_id = public.current_customer_id())
  with check (customer_id = public.current_customer_id());

drop policy if exists "customer_profiles_admin" on public.customer_profiles;
create policy "customer_profiles_admin" on public.customer_profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- registrant_profiles: قراءة لصاحبها فقط، ومفيش تعديل من العميل (الإدارة بس).
drop policy if exists "registrant_profiles_select_own" on public.registrant_profiles;
create policy "registrant_profiles_select_own" on public.registrant_profiles
  for select using (customer_id = public.current_customer_id());

drop policy if exists "registrant_profiles_admin" on public.registrant_profiles;
create policy "registrant_profiles_admin" on public.registrant_profiles
  for all using (public.is_admin()) with check (public.is_admin());
