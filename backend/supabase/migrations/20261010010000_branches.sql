-- Multiple branches.
--
-- Until now the system was a single store (GMA Terminal). Every order, kiosk
-- and support conversation now belongs to a branch, and staff are tied to the
-- branches they work at:
--
--   super_admin - every branch (former admins are promoted to this)
--   admin       - only the branches listed for them in branch_staff
--   cashier     - one branch: each branch has its own shared cashier account
--   rider       - one branch: they only see that branch's delivery pool
--
-- The menu stays shared. Existing rows all move to GMA Terminal.

-- ---------------------------------------------------------------------------
-- branches
-- ---------------------------------------------------------------------------
create table public.branches (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[a-z0-9-]{2,30}$'),
  name       text not null unique check (char_length(btrim(name)) between 1 and 80),
  address    text check (address is null or char_length(address) <= 300),
  phone      text check (phone is null or phone ~ '^09[0-9]{9}$'),
  latitude   numeric(9, 6) not null check (latitude between 4 and 22),
  longitude  numeric(9, 6) not null check (longitude between 116 and 128),
  -- Manila wall-clock hours. Both null means open around the clock.
  opens_at   time,
  closes_at  time,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((opens_at is null) = (closes_at is null)),
  check (opens_at is null or closes_at > opens_at)
);

insert into public.branches (code, name, latitude, longitude, opens_at, closes_at) values
  ('gma',      'GMA Terminal', 14.295601, 120.999645, '08:00', '21:00'),
  ('dasma',    'Dasma Bayan',  14.322356, 120.938582, '08:00', '21:00'),
  ('langkaan', 'Langkaan',     14.295971, 120.937062, '08:00', '21:00'),
  ('gentri',   'Gen-Tri',      14.293809, 120.907708, '08:00', '21:00'),
  ('trece',    'Trece',        14.277458, 120.870550, '08:00', '21:00'),
  ('silang',   'Silang',       14.228719, 120.970119, '08:00', '21:00'),
  ('imus',     'Imus',         14.385954, 120.939289, '08:00', '21:00');

alter table public.branches enable row level security;

create policy "Active branches are publicly readable" on public.branches
  for select using (is_active);

-- ---------------------------------------------------------------------------
-- branch_staff - which branches a staff account works at. Admins may have
-- several rows; cashiers and riders have exactly one (enforced by the API).
-- No policies: read through has_branch_access() or the secret key only.
-- ---------------------------------------------------------------------------
create table public.branch_staff (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  branch_id  uuid not null references public.branches (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, branch_id)
);

create index branch_staff_branch_idx on public.branch_staff (branch_id);

alter table public.branch_staff enable row level security;

-- ---------------------------------------------------------------------------
-- has_branch_access() - the RLS check for staff. Reads branch_staff instead of
-- a JWT claim, so taking a branch away from an admin applies at once rather
-- than when their token next refreshes.
-- ---------------------------------------------------------------------------
create function public.has_branch_access(p_branch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.auth_role() = 'super_admin'
      or exists (
        select 1 from public.branch_staff s
        where s.profile_id = auth.uid() and s.branch_id = p_branch
      )
$$;

revoke all on function public.has_branch_access(uuid) from public, anon;
grant execute on function public.has_branch_access(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- branch_id on orders, kiosks and support conversations
-- ---------------------------------------------------------------------------
alter table public.orders        add column branch_id uuid references public.branches (id);
alter table public.kiosk_devices add column branch_id uuid references public.branches (id);
alter table public.chat_threads  add column branch_id uuid references public.branches (id);

update public.orders        set branch_id = (select id from public.branches where code = 'gma');
update public.kiosk_devices set branch_id = (select id from public.branches where code = 'gma');
update public.chat_threads  set branch_id = (select id from public.branches where code = 'gma');

alter table public.orders        alter column branch_id set not null;
alter table public.kiosk_devices alter column branch_id set not null;
alter table public.chat_threads  alter column branch_id set not null;

create index orders_branch_status_idx  on public.orders (branch_id, status);
create index orders_branch_created_idx on public.orders (branch_id, created_at);
create index kiosk_devices_branch_idx  on public.kiosk_devices (branch_id);
drop index if exists public.chat_threads_inbox_idx;
create index chat_threads_inbox_idx on public.chat_threads (branch_id, kind, last_message_at desc);

-- ---------------------------------------------------------------------------
-- Order numbers count per branch: each branch's K-0001 starts every Manila day.
-- ---------------------------------------------------------------------------
alter table public.order_counters add column branch_id uuid references public.branches (id) on delete cascade;
update public.order_counters set branch_id = (select id from public.branches where code = 'gma');
alter table public.order_counters alter column branch_id set not null;
alter table public.order_counters drop constraint order_counters_pkey;
alter table public.order_counters add primary key (branch_id, business_date, channel);

drop index if exists public.orders_order_number_day_key;
create unique index orders_order_number_day_key
  on public.orders (branch_id, order_number, ((created_at at time zone 'Asia/Manila')::date));

drop function public.next_order_number(text);

create function public.next_order_number(p_branch uuid, p_channel text) returns text
language plpgsql security invoker set search_path = '' as $$
declare
  -- Business day is Manila time, not UTC: a 9pm order must not roll into
  -- tomorrow's sequence or tomorrow's sales report.
  v_date date := (now() at time zone 'Asia/Manila')::date;
  v_seq  integer;
begin
  insert into public.order_counters (branch_id, business_date, channel, last_number)
  values (p_branch, v_date, p_channel, 1)
  on conflict (branch_id, business_date, channel)
    do update set last_number = public.order_counters.last_number + 1
  returning last_number into v_seq;

  return upper(left(p_channel, 1)) || '-' || lpad(v_seq::text, 4, '0');
end $$;

create or replace function public.set_order_number() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.order_number is null then
    new.order_number := public.next_order_number(new.branch_id, new.channel::text);
  end if;
  return new;
end $$;

revoke all on function public.next_order_number(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Kiosk gate password per branch
-- ---------------------------------------------------------------------------
alter table public.employee_credentials add column branch_id uuid references public.branches (id) on delete cascade;
update public.employee_credentials set branch_id = (select id from public.branches where code = 'gma');
alter table public.employee_credentials alter column branch_id set not null;
alter table public.employee_credentials drop constraint employee_credentials_pkey;
alter table public.employee_credentials add primary key (role, branch_id);

-- ---------------------------------------------------------------------------
-- Existing accounts: admins become super admins; the shared cashier and the
-- riders work at GMA Terminal.
-- ---------------------------------------------------------------------------
update public.profiles set role = 'super_admin', updated_at = now() where role = 'admin';
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"super_admin"}'::jsonb
 where raw_app_meta_data ->> 'role' = 'admin';

insert into public.branch_staff (profile_id, branch_id)
select p.id, b.id
from public.profiles p, public.branches b
where p.role in ('cashier', 'rider') and b.code = 'gma'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security: staff see only their branches; super admins see all.
-- These policies scope every Realtime subscription too.
-- ---------------------------------------------------------------------------
drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles
  for select using (auth.uid() = id or public.auth_role() = 'super_admin');

drop policy if exists "Staff read all orders" on public.orders;
create policy "Staff read their branches' orders" on public.orders
  for select using (
    public.auth_role() in ('cashier', 'admin', 'super_admin') and public.has_branch_access(branch_id)
  );

drop policy if exists "Riders read pool and own deliveries" on public.orders;
create policy "Riders read pool and own deliveries" on public.orders
  for select using (
    public.auth_role() = 'rider'
    and fulfillment_type = 'delivery'
    and (
      rider_id = auth.uid()
      or (rider_id is null and status = 'ready' and public.has_branch_access(branch_id))
    )
  );

drop policy if exists "Order items follow their order" on public.order_items;
create policy "Order items follow their order" on public.order_items
  for select using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and (
        o.customer_id = auth.uid()
        or (public.auth_role() in ('cashier', 'admin', 'super_admin') and public.has_branch_access(o.branch_id))
        or (public.auth_role() = 'rider' and o.rider_id = auth.uid())
      )
  ));

drop policy if exists "Customers read own payments" on public.payments;
create policy "Customers read own payments" on public.payments
  for select using (exists (
    select 1 from public.orders o
    where o.id = payments.order_id
      and (
        o.customer_id = auth.uid()
        or (public.auth_role() in ('cashier', 'admin', 'super_admin') and public.has_branch_access(o.branch_id))
      )
  ));

drop policy if exists "Chat threads visible to staff and the order's customer or rider" on public.chat_threads;
create policy "Chat threads visible to staff and the order's customer or rider" on public.chat_threads
  for select using (
    (public.auth_role() in ('cashier', 'admin', 'super_admin') and public.has_branch_access(branch_id))
    or (
      kind = 'delivery'
      and exists (
        select 1 from public.orders o
        where o.id = chat_threads.order_id
          and (o.customer_id = auth.uid() or (public.auth_role() = 'rider' and o.rider_id = auth.uid()))
      )
    )
  );

drop policy if exists "Chat messages follow their thread" on public.chat_messages;
create policy "Chat messages follow their thread" on public.chat_messages
  for select using (exists (
    select 1
    from public.chat_threads t
    left join public.orders o on o.id = t.order_id
    where t.id = chat_messages.thread_id
      and (
        (public.auth_role() in ('cashier', 'admin', 'super_admin') and public.has_branch_access(t.branch_id))
        or (
          t.kind = 'delivery'
          and (o.customer_id = auth.uid() or (public.auth_role() = 'rider' and o.rider_id = auth.uid()))
        )
      )
  ));

-- ---------------------------------------------------------------------------
-- Sales report: restricted to a set of branches (null = all), plus a
-- per-branch breakdown for the super admin.
-- ---------------------------------------------------------------------------
drop function public.sales_report(timestamptz, timestamptz);

create function public.sales_report(p_from timestamptz, p_to timestamptz, p_branch_ids uuid[] default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with sales as (
    select o.id,
           o.total_amount,
           o.branch_id,
           o.channel::text as channel,
           coalesce(o.payment_method::text, 'unknown') as method,
           (o.created_at at time zone 'Asia/Manila')::date as day
    from public.orders o
    where o.payment_status = 'paid'
      and o.status not in ('voided', 'cancelled')
      and o.created_at >= p_from
      and o.created_at < p_to
      and (p_branch_ids is null or o.branch_id = any (p_branch_ids))
  ),
  -- every Manila day in the range, so quiet days show as zero instead of vanishing
  days as (
    select d::date as day
    from generate_series(
      (p_from at time zone 'Asia/Manila')::date,
      ((p_to - interval '1 microsecond') at time zone 'Asia/Manila')::date,
      interval '1 day'
    ) as d
  ),
  daily as (
    select days.day, count(s.id) as orders, coalesce(sum(s.total_amount), 0) as revenue
    from days
    left join sales s on s.day = days.day
    group by days.day
  ),
  lines as (
    select i.product_id, p.name, v.label as variant, i.quantity, i.quantity * i.unit_price as amount
    from public.order_items i
    join sales s on s.id = i.order_id
    join public.products p on p.id = i.product_id
    left join public.product_variants v on v.id = i.variant_id
  ),
  top as (
    select product_id, name, variant, sum(quantity)::int as quantity, sum(amount) as revenue
    from lines
    group by product_id, name, variant
    order by sum(quantity) desc, sum(amount) desc, name
    limit 10
  ),
  waiting as (
    select count(*) as orders, coalesce(sum(o.total_amount), 0) as amount
    from public.orders o
    where o.status = 'voided'
      and o.payment_status in ('refund_pending', 'refund_failed')
      and o.created_at >= p_from
      and o.created_at < p_to
      and (p_branch_ids is null or o.branch_id = any (p_branch_ids))
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'orders', (select count(*) from sales),
      'revenue', (select coalesce(sum(total_amount), 0) from sales),
      'average_order', (
        select case when count(*) = 0 then 0 else round(sum(total_amount) / count(*), 2) end from sales
      ),
      'items_sold', (select coalesce(sum(quantity), 0)::int from lines)
    ),
    'daily', (
      select coalesce(jsonb_agg(
        jsonb_build_object('date', to_char(day, 'YYYY-MM-DD'), 'orders', orders, 'revenue', revenue)
        order by day
      ), '[]'::jsonb)
      from daily
    ),
    'by_method', (
      select coalesce(jsonb_agg(
        jsonb_build_object('method', method, 'orders', n, 'revenue', total) order by total desc
      ), '[]'::jsonb)
      from (select method, count(*) as n, sum(total_amount) as total from sales group by method) m
    ),
    'by_channel', (
      select coalesce(jsonb_agg(
        jsonb_build_object('channel', channel, 'orders', n, 'revenue', total) order by total desc
      ), '[]'::jsonb)
      from (select channel, count(*) as n, sum(total_amount) as total from sales group by channel) c
    ),
    'by_branch', (
      select coalesce(jsonb_agg(
        jsonb_build_object('branch_id', b.id, 'name', b.name, 'orders', n, 'revenue', total)
        order by total desc, b.name
      ), '[]'::jsonb)
      from (select branch_id, count(*) as n, sum(total_amount) as total from sales group by branch_id) x
      join public.branches b on b.id = x.branch_id
    ),
    'top_items', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'product_id', product_id, 'name', name, 'variant', variant,
          'quantity', quantity, 'revenue', revenue
        ) order by quantity desc, revenue desc, name
      ), '[]'::jsonb)
      from top
    ),
    'refunds_pending', (
      select jsonb_build_object('orders', orders, 'amount', amount) from waiting
    )
  );
$$;

revoke all on function public.sales_report(timestamptz, timestamptz, uuid[]) from public, anon, authenticated;
grant execute on function public.sales_report(timestamptz, timestamptz, uuid[]) to service_role;
