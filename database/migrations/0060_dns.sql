-- ==========================================================================
-- Migo Domains - 0060: إدارة DNS (dns_zones · dns_records)
-- --------------------------------------------------------------------------
-- الحالة: مكتوب للمراجعة فقط. **لم يُنفَّذ**.
--
-- مرآة لقواعد المزوّد (providers/lib/mock.js):
--   - TTL من 60 لـ86400.
--   - سجلات السلطة (NS · CAA) **ممنوعة** من التعديل/الحذف العادي:
--     ليها مسارها الخاص (الـNameservers). التحديث الجماعي بياخد الـzone كوحدة.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1) dns_zones
-- --------------------------------------------------------------------------
create table if not exists public.dns_zones (
  id                 uuid primary key default gen_random_uuid(),
  customer_domain_id uuid not null unique references public.customer_domains(id) on delete cascade,
  provider_zone_id   text,
  status             text not null default 'pending'
                     check (status in ('pending', 'active', 'error', 'disabled')),
  is_hosted          boolean not null default false,   -- DNS مُستضاف عندنا
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists trg_dns_zones_updated_at on public.dns_zones;
create trigger trg_dns_zones_updated_at before update on public.dns_zones
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- 2) dns_records
-- --------------------------------------------------------------------------
create table if not exists public.dns_records (
  id           uuid primary key default gen_random_uuid(),
  zone_id      uuid not null references public.dns_zones(id) on delete cascade,
  type         text not null
               check (type in ('A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS',
                               'SRV', 'CAA', 'ALIAS', 'PTR')),
  name         text not null default '@',
  value        text not null,
  ttl          int not null default 3600 check (ttl between 60 and 86400),
  priority     int check (priority is null or priority between 0 and 65535),
  -- سجلات السلطة مش بتتعدّل من مسار سجلات DNS العادي.
  is_authority boolean generated always as (type in ('NS', 'CAA')) stored,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (zone_id, type, name, value)
);

create index if not exists idx_dns_records_zone on public.dns_records(zone_id, type);

drop trigger if exists trg_dns_records_updated_at on public.dns_records;
create trigger trg_dns_records_updated_at before update on public.dns_records
  for each row execute function public.set_updated_at();

-- تريجر: منع تعديل/حذف سجلات السلطة (نفس رفض المزوّد AUTHORITY_RECORD_IMMUTABLE).
create or replace function public.prevent_authority_record_change()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'DELETE' and old.is_authority)
     or (tg_op = 'UPDATE' and (old.is_authority or new.is_authority)) then
    raise exception 'سجلات السلطة (NS · CAA) مش بتتعدّل من مسار DNS، وليها مسار الـNameservers'
      using errcode = 'restrict_violation';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_dns_records_authority_guard on public.dns_records;
create trigger trg_dns_records_authority_guard
  before update or delete on public.dns_records
  for each row execute function public.prevent_authority_record_change();

-- ==========================================================================
-- RLS
-- ==========================================================================
alter table public.dns_zones   enable row level security;
alter table public.dns_records enable row level security;

drop policy if exists "dns_zones_select_own" on public.dns_zones;
create policy "dns_zones_select_own" on public.dns_zones
  for select using (
    exists (select 1 from public.customer_domains d
            where d.id = dns_zones.customer_domain_id
              and d.customer_id = public.current_customer_id())
  );

drop policy if exists "dns_zones_admin" on public.dns_zones;
create policy "dns_zones_admin" on public.dns_zones
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "dns_records_select_own" on public.dns_records;
create policy "dns_records_select_own" on public.dns_records
  for select using (
    exists (select 1 from public.dns_zones z
            join public.customer_domains d on d.id = z.customer_domain_id
            where z.id = dns_records.zone_id
              and d.customer_id = public.current_customer_id())
  );

drop policy if exists "dns_records_admin" on public.dns_records;
create policy "dns_records_admin" on public.dns_records
  for all using (public.is_admin()) with check (public.is_admin());
