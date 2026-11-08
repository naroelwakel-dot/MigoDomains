-- ==========================================================================
-- Migo Domains - 0040: الدفع (payments · payment_webhooks)
-- --------------------------------------------------------------------------
-- الحالة: مكتوب للمراجعة فقط. **لم يُنفَّذ**.
--
-- بوابة الدفع معطّلة في مرحلة التصميم، والجداول دي بتجهّز الشكل بس.
--
-- حماية: payment_webhooks **ممنوع** يخزّن أرقام بطاقات أو بيانات مالك كاملة
-- أو Auth/EPP Codes. الحقول الحسّاسة بتُحذَف قبل الحفظ (redaction) ويُحفظ مرجع.
-- الجدول **append-only**: insert فقط، وممنوع UPDATE/DELETE.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1) payments
-- --------------------------------------------------------------------------
create table if not exists public.payments (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete restrict,
  customer_id       uuid not null references public.customers(id) on delete restrict,
  gateway           text not null,               -- مثال: stripe · paymob
  gateway_payment_id text not null,
  method            text,                        -- card · wallet · transfer
  amount_micros     bigint not null check (amount_micros >= 0),
  currency          char(3) not null default 'USD' check (currency in ('USD', 'EGP')),
  status            text not null default 'initiated'
                    check (status in ('initiated', 'pending', 'succeeded', 'failed',
                                      'refunded', 'partially_refunded', 'disputed')),
  failure_reason    text,
  paid_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- منع صف دفع مكرر
  unique (gateway, gateway_payment_id)
);

create index if not exists idx_payments_order on public.payments(order_id);
create index if not exists idx_payments_customer on public.payments(customer_id, created_at desc);

drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- 2) payment_webhooks: كل Webhook بما فيه المكرر والمزيّف (لأجل التدقيق وIdempotency).
-- --------------------------------------------------------------------------
create table if not exists public.payment_webhooks (
  id                 uuid primary key default gen_random_uuid(),
  gateway            text not null,
  event_id           text not null,              -- معرّف الحدث عند البوابة
  event_type         text not null,
  signature_verified boolean not null default false,
  status             text not null default 'received'
                     check (status in ('received', 'processed', 'failed', 'ignored')),
  payload_redacted   jsonb,                      -- بعد حذف الحقول الحسّاسة
  failure_reason     text,
  received_at        timestamptz not null default now(),
  processed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Idempotency: نفس الحدث يتخزّن مرة واحدة
  unique (gateway, event_id),
  -- منع تخزين حقول حسّاسة داخل الـpayload (حماية إضافية فوق الـredaction).
  constraint payment_webhooks_no_secrets check (
    payload_redacted is null
    or (
      not (payload_redacted ? 'card_number')
      and not (payload_redacted ? 'cvc')
      and not (payload_redacted ? 'auth_code')
      and not (payload_redacted ? 'epp_code')
    )
  )
);

create index if not exists idx_payment_webhooks_gateway on public.payment_webhooks(gateway, received_at desc);

-- append-only: ممنوع أي UPDATE أو DELETE.
drop trigger if exists trg_payment_webhooks_immutable on public.payment_webhooks;
create trigger trg_payment_webhooks_immutable
  before update or delete on public.payment_webhooks
  for each row execute function public.prevent_change();

-- ==========================================================================
-- RLS
-- ==========================================================================
alter table public.payments         enable row level security;
alter table public.payment_webhooks enable row level security;

-- العميل: يقرأ مدفوعاته بس، ومفيش كتابة.
drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own" on public.payments
  for select using (customer_id = public.current_customer_id());

drop policy if exists "payments_admin" on public.payments;
create policy "payments_admin" on public.payments
  for all using (public.is_admin()) with check (public.is_admin());

-- Webhooks: العميل ممنوع تمامًا. الإدارة قراءة بس. الكتابة من الـBackend (service_role).
drop policy if exists "payment_webhooks_admin_read" on public.payment_webhooks;
create policy "payment_webhooks_admin_read" on public.payment_webhooks
  for select using (public.is_admin());
