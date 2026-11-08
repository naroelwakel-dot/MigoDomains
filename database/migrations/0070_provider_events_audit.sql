-- ==========================================================================
-- Migo Domains - 0070: أحداث المزوّد وسجل التدقيق (provider_events · audit_logs)
-- --------------------------------------------------------------------------
-- الحالة: مكتوب للمراجعة فقط. **لم يُنفَّذ**.
--
-- الجدولان **append-only**: insert فقط. ممنوع UPDATE/DELETE حتى على service
-- (المنع بتريجر صريح، مش بس بغياب السياسة).
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1) provider_events: سجل أحداث المزوّد الخام (طلبات/ردود/أخطاء/Timeouts).
-- --------------------------------------------------------------------------
create table if not exists public.provider_events (
  id                  uuid primary key default gen_random_uuid(),
  provider_account_id uuid not null references public.provider_accounts(id) on delete cascade,
  provider_event_id   text not null,
  event_type          text not null,
  direction           text not null default 'response'
                      check (direction in ('request', 'response', 'webhook')),
  http_status         int,
  duration_ms         int check (duration_ms is null or duration_ms >= 0),
  outcome             text not null default 'ok'
                      check (outcome in ('ok', 'error', 'timeout')),
  error_code          text,
  payload_redacted    jsonb,                    -- بعد حذف أي حقل حسّاس (Auth Codes …)
  occurred_at         timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (provider_account_id, provider_event_id)   -- منع تكرار أحداث المزوّد
);

create index if not exists idx_provider_events_account on public.provider_events(provider_account_id, occurred_at desc);

drop trigger if exists trg_provider_events_immutable on public.provider_events;
create trigger trg_provider_events_immutable
  before update or delete on public.provider_events
  for each row execute function public.prevent_change();

-- --------------------------------------------------------------------------
-- 2) audit_logs: كل تغيير حسّاس (أسعار · صلاحيات · ملكية · طلبات · رموز النقل).
-- --------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_type  text not null check (actor_type in ('customer', 'admin', 'system', 'provider')),
  actor_id    uuid,
  action      text not null,          -- مثال: price.update · owner.change · authcode.view
  entity_type text,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  reason      text,
  ip          inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_audit_logs_entity on public.audit_logs(entity_type, entity_id, created_at desc);
create index if not exists idx_audit_logs_actor on public.audit_logs(actor_type, actor_id, created_at desc);
create index if not exists idx_audit_logs_action on public.audit_logs(action, created_at desc);

drop trigger if exists trg_audit_logs_immutable on public.audit_logs;
create trigger trg_audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function public.prevent_change();

-- ==========================================================================
-- RLS
-- ==========================================================================
alter table public.provider_events enable row level security;
alter table public.audit_logs      enable row level security;

-- العميل ممنوع تمامًا من الاتنين.
drop policy if exists "provider_events_admin_read" on public.provider_events;
create policy "provider_events_admin_read" on public.provider_events
  for select using (public.is_admin());

-- audit_logs: الإدارة تقرأ فقط. الكتابة (insert) من الـBackend/service_role.
drop policy if exists "audit_logs_admin_read" on public.audit_logs;
create policy "audit_logs_admin_read" on public.audit_logs
  for select using (public.is_admin());
