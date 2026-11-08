-- ==========================================================================
-- Migo Domains - 0010: الكتالوج المرجعي (المزوّدون · الامتدادات · FX · خطط DNS · الإعدادات)
-- --------------------------------------------------------------------------
-- الحالة: مكتوب للمراجعة فقط. **لم يُنفَّذ**.
--
-- قاعدة النقود: كل مبلغ بيتخزّن bigint بوحدة 1e-6 دولار (ميكرو-دولار)
-- عشان يطابق محرك التسعير (pricing/lib/decimal.js) بدون أخطاء الكسور العشرية.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1) providers: كتالوج المزوّدين (الشركات نفسها، مش حساباتنا).
-- --------------------------------------------------------------------------
create table if not exists public.providers (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,          -- مثال: openprovider · cloudflare
  name          text not null,
  api_base      text,
  is_active     boolean not null default false,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists trg_providers_updated_at on public.providers;
create trigger trg_providers_updated_at before update on public.providers
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- 2) provider_accounts: حساباتنا عند المزوّدين.
--    ممنوع أي سر هنا: عمود credentials_ref مرجع فقط (اسم سر في مخزن آمن).
-- --------------------------------------------------------------------------
create table if not exists public.provider_accounts (
  id              uuid primary key default gen_random_uuid(),
  provider_id     uuid not null references public.providers(id) on delete restrict,
  label           text not null,
  environment     text not null default 'sandbox'
                  check (environment in ('sandbox', 'production')),
  status          text not null default 'disconnected'
                  check (status in ('disconnected', 'connected', 'error', 'disabled')),
  credentials_ref text,                          -- مرجع فقط، ممنوع القيمة نفسها
  last_check_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (provider_id, label, environment)
);

create index if not exists idx_provider_accounts_provider on public.provider_accounts(provider_id);

drop trigger if exists trg_provider_accounts_updated_at on public.provider_accounts;
create trigger trg_provider_accounts_updated_at before update on public.provider_accounts
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3) domain_tlds: الامتدادات المدعومة وحقائقها.
-- --------------------------------------------------------------------------
create table if not exists public.domain_tlds (
  id               uuid primary key default gen_random_uuid(),
  tld              text not null unique,          -- مثال: com · io · eg
  registry         text,
  rdap_url         text,
  country          char(2),
  supports_transfer boolean not null default true,
  min_registration_years smallint not null default 1 check (min_registration_years between 1 and 10),
  is_active        boolean not null default true,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists trg_domain_tlds_updated_at on public.domain_tlds;
create trigger trg_domain_tlds_updated_at before update on public.domain_tlds
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- 4) fx_rates: أسعار الصرف المعتمدة. ممنوع سعر مكتوب في الكود.
-- --------------------------------------------------------------------------
create table if not exists public.fx_rates (
  id            uuid primary key default gen_random_uuid(),
  base_currency char(3) not null default 'USD',
  quote_currency char(3) not null default 'EGP',
  rate_micros   bigint not null check (rate_micros > 0),  -- 1e-6 وحدة quote لكل 1 base
  source        text not null,
  is_approved   boolean not null default false,
  effective_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (base_currency, quote_currency, effective_at)
);

create index if not exists idx_fx_rates_lookup
  on public.fx_rates(base_currency, quote_currency, effective_at desc);

drop trigger if exists trg_fx_rates_updated_at on public.fx_rates;
create trigger trg_fx_rates_updated_at before update on public.fx_rates
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- 5) dns_plans: خطط إدارة DNS (الحدود والسعر).
-- --------------------------------------------------------------------------
create table if not exists public.dns_plans (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  name         text not null,
  max_zones    int not null default 1 check (max_zones >= 0),
  max_records  int not null default 50 check (max_records >= 0),
  price_micros bigint not null default 0 check (price_micros >= 0),
  currency     char(3) not null default 'USD',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_dns_plans_updated_at on public.dns_plans;
create trigger trg_dns_plans_updated_at before update on public.dns_plans
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- 6) system_settings: إعدادات المنصة (key/value).
-- --------------------------------------------------------------------------
create table if not exists public.system_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_system_settings_updated_at on public.system_settings;
create trigger trg_system_settings_updated_at before update on public.system_settings
  for each row execute function public.set_updated_at();

-- ==========================================================================
-- RLS: الأساس deny، والسماح استثناء صريح (docs/phase-zero/DATABASE_ARCHITECTURE.md)
-- ==========================================================================
alter table public.providers         enable row level security;
alter table public.provider_accounts enable row level security;
alter table public.domain_tlds       enable row level security;
alter table public.fx_rates          enable row level security;
alter table public.dns_plans         enable row level security;
alter table public.system_settings   enable row level security;

-- domain_tlds · dns_plans: قراءة مرجعية للعميل، والإدارة كل شيء.
drop policy if exists "domain_tlds_read" on public.domain_tlds;
create policy "domain_tlds_read" on public.domain_tlds
  for select to authenticated using (true);
drop policy if exists "domain_tlds_admin" on public.domain_tlds;
create policy "domain_tlds_admin" on public.domain_tlds
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "dns_plans_read" on public.dns_plans;
create policy "dns_plans_read" on public.dns_plans
  for select to authenticated using (true);
drop policy if exists "dns_plans_admin" on public.dns_plans;
create policy "dns_plans_admin" on public.dns_plans
  for all using (public.is_admin()) with check (public.is_admin());

-- providers · provider_accounts: الإدارة فقط (بيانات تشغيلية داخلية).
drop policy if exists "providers_admin" on public.providers;
create policy "providers_admin" on public.providers
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "provider_accounts_admin" on public.provider_accounts;
create policy "provider_accounts_admin" on public.provider_accounts
  for all using (public.is_admin()) with check (public.is_admin());

-- fx_rates: الإدارة فقط. العميل يشوف السعر النهائي في العرض، مش سعر الصرف الخام.
drop policy if exists "fx_rates_admin" on public.fx_rates;
create policy "fx_rates_admin" on public.fx_rates
  for all using (public.is_admin()) with check (public.is_admin());

-- system_settings: الإدارة فقط.
drop policy if exists "system_settings_admin" on public.system_settings;
create policy "system_settings_admin" on public.system_settings
  for all using (public.is_admin()) with check (public.is_admin());
