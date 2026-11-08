-- ==========================================================================
-- Migo Domains - 0030: العروض والطلبات (domain_quotes · orders · order_items)
-- --------------------------------------------------------------------------
-- الحالة: مكتوب للمراجعة فقط. **لم يُنفَّذ**.
--
-- قاعدة إلزامية: domain_quotes يخزّن **لقطة تسعير غير قابلة للتغيير**.
-- تعديل تكلفة المزوّد أو سعر الصرف بعد كده **ما يغيّرش** عرضًا قديمًا.
-- بيتحقّق بتريجر بيمنع أي UPDATE/DELETE على الجدول.
--
-- العرض بيحمل تكلفة المزوّد والهامش (أرقام داخلية) → العميل **ممنوع** يقرأ
-- الجدول مباشرة؛ بيقرأ الـview العميل الآمن (بدون أعمدة التكلفة/الهامش).
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1) domain_quotes: لقطة تسعير غير قابلة للتغيير.
-- --------------------------------------------------------------------------
create table if not exists public.domain_quotes (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid references public.customers(id) on delete set null,
  session_ref        text,                       -- للعروض قبل تسجيل الدخول
  domain_name        text not null,
  tld                text not null,
  operation          text not null
                     check (operation in ('register', 'renew', 'transfer', 'restore')),
  provider_id        uuid references public.providers(id) on delete set null,
  -- لقطة التكلفة والهامش (أرقام داخلية - ممنوعة على العميل)
  cost_currency      char(3) not null default 'USD',
  total_cost_micros  bigint not null check (total_cost_micros >= 0),
  margin_micros      bigint not null check (margin_micros >= 0),
  margin_rule_code   text,
  margin_rule_kind   text check (margin_rule_kind in ('tier', 'tld_override')),
  margin_rule_version text,
  margin_detail      jsonb,
  -- سعر البيع
  sale_usd_micros    bigint not null check (sale_usd_micros >= 0),
  fx_rate_micros     bigint check (fx_rate_micros is null or fx_rate_micros > 0),
  sale_egp_micros    bigint check (sale_egp_micros is null or sale_egp_micros >= 0),
  -- موثوقية اللقطة
  cost_source        text not null,
  cost_is_verified   boolean not null default false,
  quoted_at          timestamptz not null default now(),
  expires_at         timestamptz,               -- قفل العرض (~15 دقيقة)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint domain_quotes_sale_covers_cost check (sale_usd_micros >= total_cost_micros)
);

create index if not exists idx_domain_quotes_customer on public.domain_quotes(customer_id, quoted_at desc);
create index if not exists idx_domain_quotes_domain on public.domain_quotes(domain_name, operation);

-- تريجر منع التعديل: اللقطة ثابتة بمجرد الكتابة.
create or replace function public.prevent_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'جدول % غير قابل للتعديل (لقطة ثابتة)', tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists trg_domain_quotes_immutable on public.domain_quotes;
create trigger trg_domain_quotes_immutable
  before update or delete on public.domain_quotes
  for each row execute function public.prevent_change();

-- --------------------------------------------------------------------------
-- 2) orders: الطلب (ممكن يحمل أكتر من بند).
-- --------------------------------------------------------------------------
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  order_number    text not null unique,          -- مثال: ORD-1041
  customer_id     uuid not null references public.customers(id) on delete restrict,
  currency        char(3) not null default 'USD' check (currency in ('USD', 'EGP')),
  total_micros    bigint not null default 0 check (total_micros >= 0),
  status          text not null default 'pending_payment'
                  check (status in ('draft', 'pending_payment', 'paid', 'processing',
                                    'completed', 'failed', 'cancelled', 'refunded',
                                    'manual_review')),
  idempotency_key text not null unique,          -- منع إنشاء طلب مكرر لنفس المحاولة
  failure_reason  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_orders_customer on public.orders(customer_id, created_at desc);
create index if not exists idx_orders_status on public.orders(status);

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3) order_items: بنود الطلب.
-- --------------------------------------------------------------------------
create table if not exists public.order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  quote_id       uuid not null references public.domain_quotes(id) on delete restrict,
  kind           text not null
                 check (kind in ('registration', 'renewal', 'transfer', 'dns')),
  domain_name    text,
  tld            text,
  sale_usd_micros bigint not null check (sale_usd_micros >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (order_id, quote_id)
);

create index if not exists idx_order_items_order on public.order_items(order_id);

drop trigger if exists trg_order_items_updated_at on public.order_items;
create trigger trg_order_items_updated_at before update on public.order_items
  for each row execute function public.set_updated_at();

-- ==========================================================================
-- RLS
--   العميل: يقرأ طلباته وبنودها وعروضه، ومفيش كتابة (الكتابة من الـBackend).
--   عرض العميل بيمرّ من view آمن **بدون** أعمدة التكلفة/الهامش.
-- ==========================================================================
alter table public.domain_quotes enable row level security;
alter table public.orders        enable row level security;
alter table public.order_items   enable row level security;

-- العروض: الإدارة فقط على الجدول الخام (بيحمل التكلفة والهامش).
drop policy if exists "domain_quotes_admin" on public.domain_quotes;
create policy "domain_quotes_admin" on public.domain_quotes
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own" on public.orders
  for select using (customer_id = public.current_customer_id());

drop policy if exists "orders_admin" on public.orders;
create policy "orders_admin" on public.orders
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "order_items_select_own" on public.order_items;
create policy "order_items_select_own" on public.order_items
  for select using (
    exists (select 1 from public.orders o
            where o.id = order_items.order_id
              and o.customer_id = public.current_customer_id())
  );

drop policy if exists "order_items_admin" on public.order_items;
create policy "order_items_admin" on public.order_items
  for all using (public.is_admin()) with check (public.is_admin());

-- view عرض العميل: أعمدة آمنة فقط (بدون تكلفة/هامش/سعر صرف خام).
create or replace view public.domain_quotes_client
with (security_invoker = on) as
select id, customer_id, domain_name, tld, operation,
       sale_usd_micros, sale_egp_micros, quoted_at, expires_at
from public.domain_quotes
where customer_id = public.current_customer_id();

grant select on public.domain_quotes_client to authenticated;
