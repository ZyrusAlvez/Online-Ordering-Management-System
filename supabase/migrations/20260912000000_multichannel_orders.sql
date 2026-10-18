-- Multi-channel ordering: kiosk / POS / online / rider / admin.
--
-- Extends the single-audience schema from 20260903000000_init_schema.sql so an
-- order can originate from an anonymous kiosk terminal, be settled at a POS,
-- or be delivered by a rider. Menu tables are untouched.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role        as enum ('customer','cashier','rider','admin');
create type public.order_channel    as enum ('kiosk','pos','online');
create type public.fulfillment_type as enum ('dine_in','take_out','delivery','pickup');
create type public.payment_method   as enum ('cash','gcash');
create type public.payment_status   as enum
  ('unpaid','processing','paid','refund_pending','refunded','refund_failed','failed');

-- ---------------------------------------------------------------------------
-- auth_role() — the caller's role, read from the JWT. Used by RLS policies,
-- which is how Supabase Realtime subscriptions get scoped per interface.
-- ---------------------------------------------------------------------------
create function public.auth_role() returns text
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'customer')
$$;

-- ---------------------------------------------------------------------------
-- profiles — mirrors auth.users so roles can be queried and joined.
-- app_metadata.role is the JWT-carried copy; profiles.role is the source of
-- truth that admin screens list and filter on.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       public.user_role not null default 'customer',
  full_name  text,
  phone      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill any users that already exist.
insert into public.profiles (id, full_name)
select id, raw_user_meta_data ->> 'full_name' from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- kiosk_devices — a kiosk has no logged-in user, so it authenticates with a
-- per-device key. Only the hash is stored; the raw key is shown once.
-- ---------------------------------------------------------------------------
create table public.kiosk_devices (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  key_hash     text not null unique,
  key_prefix   text not null,
  is_active    boolean not null default true,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Order numbers — short human-readable codes the POS looks orders up by,
-- since customer names collide. Resets daily, per channel: K-0042, P-0013.
-- ---------------------------------------------------------------------------
create table public.order_counters (
  business_date date not null,
  channel       text not null,
  last_number   integer not null default 0,
  primary key (business_date, channel)
);

create function public.next_order_number(p_channel text) returns text
language plpgsql as $$
declare
  -- Business day is Manila time, not UTC: a 9pm order must not roll into
  -- tomorrow's sequence or tomorrow's sales report.
  v_date date := (now() at time zone 'Asia/Manila')::date;
  v_seq  integer;
begin
  insert into public.order_counters (business_date, channel, last_number)
  values (v_date, p_channel, 1)
  on conflict (business_date, channel)
    do update set last_number = public.order_counters.last_number + 1
  returning last_number into v_seq;

  return upper(left(p_channel, 1)) || '-' || lpad(v_seq::text, 4, '0');
end $$;

-- ---------------------------------------------------------------------------
-- orders — channel, fulfilment, payment state, rider assignment, voids.
-- ---------------------------------------------------------------------------
alter table public.orders
  alter column customer_id drop not null,
  add column order_number     text unique,
  add column channel          public.order_channel    not null default 'online',
  add column fulfillment_type public.fulfillment_type not null default 'delivery',
  add column customer_name    text,
  add column customer_phone   text,
  add column payment_method   public.payment_method,
  add column payment_status   public.payment_status not null default 'unpaid',
  add column kiosk_device_id  uuid references public.kiosk_devices (id) on delete set null,
  add column rider_id         uuid references public.profiles (id) on delete set null,
  add column claimed_at       timestamptz,
  add column delivered_at     timestamptz,
  add column delivery_address jsonb,
  add column voided_at        timestamptz,
  add column voided_by        uuid references public.profiles (id) on delete set null,
  add column void_reason      text;

alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check check (status in
  ('pending','confirmed','preparing','ready','out_for_delivery',
   'completed','cancelled','voided'));

-- An order is either tied to a signed-in customer or carries a walk-in name.
alter table public.orders add constraint orders_identified_check
  check (customer_id is not null or customer_name is not null);

-- Channel and fulfilment must agree: you cannot have a delivery from a kiosk.
alter table public.orders add constraint orders_channel_fulfillment_check check (
  (channel in ('kiosk','pos') and fulfillment_type in ('dine_in','take_out')) or
  (channel = 'online'         and fulfillment_type in ('delivery','pickup'))
);

create function public.set_order_number() returns trigger
language plpgsql as $$
begin
  if new.order_number is null then
    new.order_number := public.next_order_number(new.channel::text);
  end if;
  return new;
end $$;

create trigger orders_set_order_number
  before insert on public.orders
  for each row execute function public.set_order_number();

create index orders_status_channel_idx on public.orders (status, channel);
create index orders_pool_idx on public.orders (status, fulfillment_type) where rider_id is null;
create index orders_rider_idx on public.orders (rider_id) where rider_id is not null;
create index orders_order_number_idx on public.orders (order_number);

-- ---------------------------------------------------------------------------
-- payments — one row per attempt, so a retried GCash charge keeps its history.
-- orders.payment_status mirrors the latest attempt for fast queue filtering
-- and because Realtime subscribers watch orders, not payments.
-- ---------------------------------------------------------------------------
create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete cascade,
  provider        text not null default 'paymongo',
  intent_id       text unique,
  payment_id      text unique,
  refund_id       text,
  amount_centavos integer not null check (amount_centavos > 0),
  status          public.payment_status not null default 'processing',
  failure_reason  text,
  raw             jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index payments_order_id_idx on public.payments (order_id);

-- PayMongo retries webhooks; each event is processed exactly once.
create table public.webhook_events (
  event_id    text primary key,
  provider    text not null default 'paymongo',
  event_type  text,
  payload     jsonb,
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- These policies are what scope each interface's Realtime subscription. All
-- staff/rider/kiosk writes go through the API's secret-key client, which
-- bypasses RLS, with requireRole/requireKiosk as the gate in the app layer.
-- ---------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.payments       enable row level security;
alter table public.kiosk_devices  enable row level security;
alter table public.order_counters enable row level security;
alter table public.webhook_events enable row level security;

-- kiosk_devices, order_counters and webhook_events get no policies at all:
-- they are reachable only via the secret-key client.

create policy "Users read own profile" on public.profiles
  for select using (auth.uid() = id or public.auth_role() = 'admin');

create policy "Users update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "Customers read own payments" on public.payments
  for select using (
    public.auth_role() in ('cashier','admin')
    or exists (
      select 1 from public.orders o
      where o.id = payments.order_id and o.customer_id = auth.uid()
    )
  );

-- Orders are readable by three different audiences; replace the single
-- customer-scoped policy from the init migration.
drop policy if exists "Customers read their own orders" on public.orders;

create policy "Customers read own orders" on public.orders
  for select using (auth.uid() = customer_id);

create policy "Staff read all orders" on public.orders
  for select using (public.auth_role() in ('cashier','admin'));

create policy "Riders read pool and own deliveries" on public.orders
  for select using (
    public.auth_role() = 'rider'
    and fulfillment_type = 'delivery'
    and (rider_id = auth.uid() or (rider_id is null and status = 'ready'))
  );

drop policy if exists "Customers read their own order items" on public.order_items;

create policy "Order items follow their order" on public.order_items
  for select using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and (
        o.customer_id = auth.uid()
        or public.auth_role() in ('cashier','admin')
        or (public.auth_role() = 'rider' and o.rider_id = auth.uid())
      )
  ));

-- ---------------------------------------------------------------------------
-- Realtime — POS, rider and customer apps subscribe directly; RLS above is
-- what keeps each subscription to its own slice.
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.order_items;
exception when duplicate_object then null;
end $$;
