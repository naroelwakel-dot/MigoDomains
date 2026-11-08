-- ==========================================================================
-- Migo Domains - 0011: التسعير (شرائح الهامش · تجاوزات الامتدادات · تكاليف المزوّد)
-- --------------------------------------------------------------------------
-- الحالة: مكتوب للمراجعة فقط. **لم يُنفَّذ**.
--
-- مرآة لبنية محرك التسعير pricing/lib/{tiers,margin,cost-feed}.js:
--   mode 'flat'    → flat_micros (هامش ثابت)
--   mode 'percent' → percent_bp (نسبة ببيسيس بوينت) + floor_micros (حد أدنى)
-- الحدود صريحة (lower/upper + inclusive) عشان تمنع الفجوات والتداخلات.
-- **ممنوع** إظهار أي عمود من الجداول دي للعميل.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1) pricing_rules: شرائح الهامش المعتمدة (سياسة Migo).
-- --------------------------------------------------------------------------
create table if not exists public.pricing_rules (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,         -- مثال: tier_under_8
  label           text not null,
  mode            text not null check (mode in ('flat', 'percent')),
  lower_micros    bigint check (lower_micros is null or lower_micros >= 0),
  lower_inclusive boolean not null default true,
  upper_micros    bigint check (upper_micros is null or upper_micros >= 0),
  upper_inclusive boolean not null default false,
  flat_micros     bigint check (flat_micros is null or flat_micros >= 0),
  percent_bp      int check (percent_bp is null or percent_bp >= 0),
  floor_micros    bigint check (floor_micros is null or floor_micros >= 0),
  rule_version    text not null default '1.0',
  priority        int not null default 100,
  is_active       boolean not null default true,
  effective_from  timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- كل وضع لازم يحمل قيمته، وممنوع يحمل قيمة الوضع التاني.
  constraint pricing_rules_mode_values check (
    (mode = 'flat'    and flat_micros is not null and percent_bp is null)
    or
    (mode = 'percent' and percent_bp is not null and flat_micros is null)
  ),
  constraint pricing_rules_bounds check (
    upper_micros is null or lower_micros is null or upper_micros > lower_micros
  )
);

create index if not exists idx_pricing_rules_active
  on public.pricing_rules(is_active, priority);

drop trigger if exists trg_pricing_rules_updated_at on public.pricing_rules;
create trigger trg_pricing_rules_updated_at before update on public.pricing_rules
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- 2) pricing_overrides: تجاوزات على مستوى الامتداد (أولوية أعلى من الشرائح).
-- --------------------------------------------------------------------------
create table if not exists public.pricing_overrides (
  id            uuid primary key default gen_random_uuid(),
  tld           text not null unique,           -- مثال: io (من غير النقطة)
  mode          text not null check (mode in ('flat', 'percent')),
  flat_micros   bigint check (flat_micros is null or flat_micros >= 0),
  percent_bp    int check (percent_bp is null or percent_bp >= 0),
  floor_micros  bigint check (floor_micros is null or floor_micros >= 0),
  reason        text not null,
  approved_by   uuid references auth.users(id) on delete set null,
  is_active     boolean not null default false,
  effective_from timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint pricing_overrides_mode_values check (
    (mode = 'flat'    and flat_micros is not null and percent_bp is null)
    or
    (mode = 'percent' and percent_bp is not null and flat_micros is null)
  )
);

drop trigger if exists trg_pricing_overrides_updated_at on public.pricing_overrides;
create trigger trg_pricing_overrides_updated_at before update on public.pricing_overrides
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3) provider_costs: تكاليف المزوّد بالجملة + رسومه (لقطة موقّتة بتتحدّث).
--    total_micros عمود محسوب = الجملة + الرسوم (زي محرك التسعير بالحرف).
-- --------------------------------------------------------------------------
create table if not exists public.provider_costs (
  id               uuid primary key default gen_random_uuid(),
  provider_id      uuid not null references public.providers(id) on delete cascade,
  tld              text not null,
  operation        text not null
                   check (operation in ('register', 'renew', 'transfer', 'restore')),
  currency         char(3) not null default 'USD',
  wholesale_micros bigint not null check (wholesale_micros >= 0),
  fees_micros      bigint not null default 0 check (fees_micros >= 0),
  total_micros     bigint generated always as (wholesale_micros + fees_micros) stored,
  source           text not null,
  is_verified      boolean not null default false,
  fetched_at       timestamptz not null default now(),
  expires_at       timestamptz,                 -- بعدها التكلفة مش موثوقة (6 ساعات)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (provider_id, tld, operation, fetched_at)
);

create index if not exists idx_provider_costs_lookup
  on public.provider_costs(provider_id, tld, operation, fetched_at desc);

drop trigger if exists trg_provider_costs_updated_at on public.provider_costs;
create trigger trg_provider_costs_updated_at before update on public.provider_costs
  for each row execute function public.set_updated_at();

-- ==========================================================================
-- RLS: كل جداول التسعير **deny للعميل** بالكامل، والإدارة فقط.
-- ==========================================================================
alter table public.pricing_rules     enable row level security;
alter table public.pricing_overrides enable row level security;
alter table public.provider_costs    enable row level security;

drop policy if exists "pricing_rules_admin" on public.pricing_rules;
create policy "pricing_rules_admin" on public.pricing_rules
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "pricing_overrides_admin" on public.pricing_overrides;
create policy "pricing_overrides_admin" on public.pricing_overrides
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "provider_costs_admin" on public.provider_costs;
create policy "provider_costs_admin" on public.provider_costs
  for all using (public.is_admin()) with check (public.is_admin());
