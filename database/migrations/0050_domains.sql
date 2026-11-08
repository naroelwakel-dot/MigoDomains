-- ==========================================================================
-- Migo Domains - 0050: الدومينات (الأصل · الاتصالات · التسجيل · النقل · التجديد · رموز النقل)
-- --------------------------------------------------------------------------
-- الحالة: مكتوب للمراجعة فقط. **لم يُنفَّذ**.
--
-- حالات الدومين من providers/lib/states.js (8 حالات) بالحرف.
-- رموز النقل (Auth Code) **ممنوعة** في customer_domains: في جدول منفصل
-- `domain_auth_codes` مش عليه أي سياسة قراءة للعميل، ومحتواه مشفّر.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1) customer_domains: الكيان الحالي للدومين.
-- --------------------------------------------------------------------------
create table if not exists public.customer_domains (
  id                   uuid primary key default gen_random_uuid(),
  customer_id          uuid not null references public.customers(id) on delete restrict,
  name                 text not null unique,
  tld                  text not null,
  provider_id          uuid references public.providers(id) on delete set null,
  provider_account_id  uuid references public.provider_accounts(id) on delete set null,
  registrant_profile_id uuid references public.registrant_profiles(id) on delete set null,
  status               text not null default 'REGISTERED'
                       check (status in ('REGISTERED', 'ACTIVE', 'EXPIRED',
                                         'REDEMPTION_PERIOD', 'PENDING_DELETE',
                                         'TRANSFER_PENDING', 'TRANSFER_COMPLETED',
                                         'TRANSFER_FAILED')),
  nameservers          text[] not null default '{}',
  auto_renew           boolean not null default false,
  transfer_lock        text check (transfer_lock in ('clientTransferProhibited',
                                                     'clientUpdateProhibited',
                                                     'clientHold', 'serverHold')),
  dnssec_enabled       boolean not null default false,
  is_premium           boolean not null default false,
  registered_at        date,
  expires_at           date,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- الـNameservers إما مجهولة (صفر) أو من 2 لـ6 (نفس قاعدة المزوّد).
  constraint customer_domains_ns_count check (
    coalesce(array_length(nameservers, 1), 0) = 0
    or coalesce(array_length(nameservers, 1), 0) between 2 and 6
  ),
  constraint customer_domains_dates check (
    expires_at is null or registered_at is null or expires_at > registered_at
  )
);

create index if not exists idx_customer_domains_customer on public.customer_domains(customer_id);
create index if not exists idx_customer_domains_expiry on public.customer_domains(expires_at);
create index if not exists idx_customer_domains_status on public.customer_domains(status);

drop trigger if exists trg_customer_domains_updated_at on public.customer_domains;
create trigger trg_customer_domains_updated_at before update on public.customer_domains
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- 2) domain_contacts: Owner/Admin/Tech/Billing لكل دومين (اللي بيُمرَّر للمزوّد).
-- --------------------------------------------------------------------------
create table if not exists public.domain_contacts (
  id                    uuid primary key default gen_random_uuid(),
  customer_domain_id    uuid not null references public.customer_domains(id) on delete cascade,
  role                  text not null check (role in ('owner', 'admin', 'tech', 'billing')),
  registrant_profile_id uuid references public.registrant_profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (customer_domain_id, role)
);

drop trigger if exists trg_domain_contacts_updated_at on public.domain_contacts;
create trigger trg_domain_contacts_updated_at before update on public.domain_contacts
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3) domain_registrations: سجل عملية التسجيل (رقم الطلب عند المزوّد + النتيجة).
-- --------------------------------------------------------------------------
create table if not exists public.domain_registrations (
  id                      uuid primary key default gen_random_uuid(),
  order_item_id           uuid not null unique references public.order_items(id) on delete restrict,
  customer_domain_id      uuid not null references public.customer_domains(id) on delete cascade,
  provider_account_id     uuid not null references public.provider_accounts(id) on delete restrict,
  provider_registration_id text not null,
  status                  text not null default 'pending'
                          check (status in ('pending', 'in_progress', 'succeeded', 'failed')),
  failure_reason          text,
  evidence                jsonb,                 -- إثبات العملية بعد حذف أي حقل حسّاس
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (provider_account_id, provider_registration_id)   -- منع تسجيل نفس العملية مرتين
);

create index if not exists idx_domain_registrations_domain on public.domain_registrations(customer_domain_id);

drop trigger if exists trg_domain_registrations_updated_at on public.domain_registrations;
create trigger trg_domain_registrations_updated_at before update on public.domain_registrations
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- 4) domain_transfers: النقل (وارد/صادر).
-- --------------------------------------------------------------------------
create table if not exists public.domain_transfers (
  id                  uuid primary key default gen_random_uuid(),
  customer_domain_id  uuid not null references public.customer_domains(id) on delete cascade,
  order_item_id       uuid references public.order_items(id) on delete set null,
  direction           text not null check (direction in ('in', 'out')),
  provider_account_id uuid not null references public.provider_accounts(id) on delete restrict,
  provider_transfer_id text not null,
  status              text not null default 'pending'
                      check (status in ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
  reason_code         text check (reason_code in ('TRANSFER_LOCKED', 'WITHIN_60_DAYS',
                                                  'DNSSEC_ACTIVE', 'BAD_STATUS',
                                                  'NO_REGISTRANT', 'AUTH_CODE_MISSING')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (provider_account_id, provider_transfer_id)       -- منع نقل مكرر
);

create index if not exists idx_domain_transfers_domain on public.domain_transfers(customer_domain_id);

drop trigger if exists trg_domain_transfers_updated_at on public.domain_transfers;
create trigger trg_domain_transfers_updated_at before update on public.domain_transfers
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- 5) domain_renewals: التجديد.
-- --------------------------------------------------------------------------
create table if not exists public.domain_renewals (
  id                  uuid primary key default gen_random_uuid(),
  customer_domain_id  uuid not null references public.customer_domains(id) on delete cascade,
  order_item_id       uuid references public.order_items(id) on delete set null,
  provider_account_id uuid not null references public.provider_accounts(id) on delete restrict,
  provider_renewal_id text not null,
  status              text not null default 'pending'
                      check (status in ('pending', 'in_progress', 'succeeded', 'failed')),
  years               smallint not null default 1 check (years between 1 and 10),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (provider_account_id, provider_renewal_id)        -- منع تجديد مكرر
);

create index if not exists idx_domain_renewals_domain on public.domain_renewals(customer_domain_id);

drop trigger if exists trg_domain_renewals_updated_at on public.domain_renewals;
create trigger trg_domain_renewals_updated_at before update on public.domain_renewals
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- 6) domain_auth_codes: رموز النقل **مشفّرة**، في جدول منفصل.
--    مفيش أي سياسة قراءة للعميل: الوصول من الـBackend بس، وبتدقيق كل ظهور.
-- --------------------------------------------------------------------------
create table if not exists public.domain_auth_codes (
  id                 uuid primary key default gen_random_uuid(),
  customer_domain_id uuid not null unique references public.customer_domains(id) on delete cascade,
  ciphertext         bytea not null,             -- مشفّر، ممنوع النص الصريح
  algorithm          text not null default 'aes-256-gcm',
  key_ref            text not null,              -- مرجع للمفتاح، ممنوع المفتاح نفسه
  expires_at         timestamptz,
  purged_at          timestamptz,                -- وقت التصفير بعد الاستخدام
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists trg_domain_auth_codes_updated_at on public.domain_auth_codes;
create trigger trg_domain_auth_codes_updated_at before update on public.domain_auth_codes
  for each row execute function public.set_updated_at();

-- ==========================================================================
-- RLS
-- ==========================================================================
alter table public.customer_domains     enable row level security;
alter table public.domain_contacts      enable row level security;
alter table public.domain_registrations enable row level security;
alter table public.domain_transfers     enable row level security;
alter table public.domain_renewals      enable row level security;
alter table public.domain_auth_codes    enable row level security;

-- العميل: دوميناته بس، ومفيش كتابة.
drop policy if exists "customer_domains_select_own" on public.customer_domains;
create policy "customer_domains_select_own" on public.customer_domains
  for select using (customer_id = public.current_customer_id());

drop policy if exists "customer_domains_admin" on public.customer_domains;
create policy "customer_domains_admin" on public.customer_domains
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "domain_contacts_select_own" on public.domain_contacts;
create policy "domain_contacts_select_own" on public.domain_contacts
  for select using (
    exists (select 1 from public.customer_domains d
            where d.id = domain_contacts.customer_domain_id
              and d.customer_id = public.current_customer_id())
  );

drop policy if exists "domain_contacts_admin" on public.domain_contacts;
create policy "domain_contacts_admin" on public.domain_contacts
  for all using (public.is_admin()) with check (public.is_admin());

-- سجلات العمليات: الإدارة قراءة فقط (الكتابة من الـBackend).
drop policy if exists "domain_registrations_read_own" on public.domain_registrations;
create policy "domain_registrations_read_own" on public.domain_registrations
  for select using (
    exists (select 1 from public.customer_domains d
            where d.id = domain_registrations.customer_domain_id
              and d.customer_id = public.current_customer_id())
  );
drop policy if exists "domain_registrations_admin_read" on public.domain_registrations;
create policy "domain_registrations_admin_read" on public.domain_registrations
  for select using (public.is_admin());

drop policy if exists "domain_transfers_read_own" on public.domain_transfers;
create policy "domain_transfers_read_own" on public.domain_transfers
  for select using (
    exists (select 1 from public.customer_domains d
            where d.id = domain_transfers.customer_domain_id
              and d.customer_id = public.current_customer_id())
  );
drop policy if exists "domain_transfers_admin_read" on public.domain_transfers;
create policy "domain_transfers_admin_read" on public.domain_transfers
  for select using (public.is_admin());

drop policy if exists "domain_renewals_read_own" on public.domain_renewals;
create policy "domain_renewals_read_own" on public.domain_renewals
  for select using (
    exists (select 1 from public.customer_domains d
            where d.id = domain_renewals.customer_domain_id
              and d.customer_id = public.current_customer_id())
  );
drop policy if exists "domain_renewals_admin_read" on public.domain_renewals;
create policy "domain_renewals_admin_read" on public.domain_renewals
  for select using (public.is_admin());

-- رموز النقل: الإدارة قراءة **مجردة** فقط (الشكل)، والوصول الفعلي من الـBackend.
-- مفيش أي سياسة للعميل عن قصد: العميل مايشوفش الجدول ولا يحتويه.
drop policy if exists "domain_auth_codes_admin_read" on public.domain_auth_codes;
create policy "domain_auth_codes_admin_read" on public.domain_auth_codes
  for select using (public.is_admin());
