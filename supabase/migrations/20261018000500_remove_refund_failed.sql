-- The last PayMongo leftover: the 'refund_failed' payment status, which only PayMongo's automatic refunds could
-- produce (refunds are by hand now: refund_pending -> refunded). Postgres cannot drop an enum value, so the type is
-- rebuilt without it. The policies and indexes that mention the type are dropped and recreated unchanged, and the two
-- functions that listed 'refund_failed' no longer do. No row used the value (checked before applying).

-- ---------------------------------------------------------------------------
-- 1. Functions: stop mentioning 'refund_failed' (they are re-parsed when run, so they must not name a value that is gone)
-- ---------------------------------------------------------------------------

create or replace function public.guard_order() returns trigger
  language plpgsql set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := public.auth_role();
  v_free text[];
  v_changed boolean;
begin
  if not public.is_client_request() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.payment_status := 'unpaid';
    new.total_amount := 0;
    new.rider_id := null;
    new.claimed_at := null;
    new.delivered_at := null;
    new.voided_at := null;
    new.voided_by := null;
    new.void_reason := null;
    new.kiosk_device_id := null;
    return new;
  end if;

  if new.id <> old.id or new.branch_id <> old.branch_id or new.channel <> old.channel
     or new.customer_id is distinct from old.customer_id or new.kiosk_device_id is distinct from old.kiosk_device_id
     or new.order_number is distinct from old.order_number or new.created_at <> old.created_at then
    raise exception 'That part of an order cannot be changed' using errcode = '42501';
  end if;
  new.total_amount := public.order_items_total(new.id);

  if public.is_counter_staff(old.branch_id) then
    return new;
  end if;

  if v_role = 'rider' and public.is_active_user() then
    v_free := array['rider_id', 'status', 'claimed_at', 'delivered_at', 'payment_status', 'payment_method', 'updated_at', 'total_amount'];
    v_changed := (to_jsonb(new) - v_free) <> (to_jsonb(old) - v_free);
    if v_changed or old.fulfillment_type <> 'delivery' then
      raise exception 'Riders can only claim, return and deliver orders' using errcode = '42501';
    end if;
    if (old.status = 'ready' and old.rider_id is null and new.status = 'out_for_delivery' and new.rider_id = v_uid)
       or (old.rider_id = v_uid and old.status = 'out_for_delivery' and new.status = 'ready' and new.rider_id is null)
       or (old.rider_id = v_uid and old.status = 'out_for_delivery' and new.rider_id = v_uid
           and new.status in ('out_for_delivery', 'completed')
           and (new.payment_status = old.payment_status
                or (new.payment_status = 'paid' and new.payment_method = 'cash'
                    and old.payment_status not in ('paid', 'refund_pending', 'refunded')))) then
      return new;
    end if;
    raise exception 'That delivery change is not allowed' using errcode = '42501';
  end if;

  if old.customer_id = v_uid then
    v_free := array['status', 'payment_status', 'updated_at', 'total_amount'];
    v_changed := (to_jsonb(new) - v_free) <> (to_jsonb(old) - v_free);
    if not v_changed then
      if new.status = 'cancelled' and old.status in ('pending', 'confirmed')
         and old.payment_status in ('unpaid', 'failed') and new.payment_status = old.payment_status then
        return new;
      end if;
      if new.status = old.status and old.payment_method = 'gcash' and old.status not in ('voided', 'cancelled')
         and old.payment_status in ('unpaid', 'failed') and new.payment_status = 'processing' then
        return new;
      end if;
      if new.status = old.status and old.payment_status = 'processing' and new.payment_status in ('unpaid', 'failed')
         and not exists (select 1 from public.payments p where p.order_id = old.id and p.status = 'processing') then
        return new;
      end if;
      if new.status = old.status and new.payment_status = old.payment_status then
        return new;
      end if;
    end if;
    raise exception 'You can only cancel your order or send your GCash payment' using errcode = '42501';
  end if;

  raise exception 'You cannot change this order' using errcode = '42501';
end;
$$;

create or replace function public.sales_report(p_from timestamptz, p_to timestamptz, p_branch_ids uuid[] default null)
  returns jsonb
  language sql stable set search_path = ''
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
      and o.payment_status = 'refund_pending'
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

-- ---------------------------------------------------------------------------
-- 2. Rebuild payment_status without 'refund_failed'
-- ---------------------------------------------------------------------------

drop policy "Delete an empty new order" on public.orders;
drop policy "Counter staff edit items before payment" on public.order_items;
drop policy "Customers add items to their new order" on public.order_items;
drop policy "Customers submit GCash payments" on public.payments;
drop policy "Riders record cash on delivery" on public.payments;
drop policy "Riders supersede waiting GCash submissions" on public.payments;
drop index public.payments_one_cash_per_order;
drop index public.payments_one_open_gcash_per_order;

alter type public.payment_status rename to payment_status_old;
create type public.payment_status as enum ('unpaid', 'processing', 'paid', 'refund_pending', 'refunded', 'failed');

alter table public.orders
  alter column payment_status drop default,
  alter column payment_status type public.payment_status using payment_status::text::public.payment_status,
  alter column payment_status set default 'unpaid';
alter table public.payments
  alter column status drop default,
  alter column status type public.payment_status using status::text::public.payment_status,
  alter column status set default 'processing';

drop type public.payment_status_old;

create unique index payments_one_cash_per_order on public.payments (order_id)
  where provider = 'cash' and status = 'paid';
create unique index payments_one_open_gcash_per_order on public.payments (order_id)
  where provider = 'gcash' and status = 'processing';

create policy "Delete an empty new order" on public.orders for delete to authenticated
  using (status = 'pending' and payment_status = 'unpaid'
         and not exists (select 1 from public.order_items i where i.order_id = orders.id)
         and (customer_id = auth.uid() or (channel = 'pos' and public.is_counter_staff(branch_id))));

create policy "Counter staff edit items before payment" on public.order_items for all to authenticated
  using (exists (select 1 from public.orders o
                 where o.id = order_items.order_id and public.is_counter_staff(o.branch_id)
                   and o.status in ('pending', 'confirmed') and o.payment_status in ('unpaid', 'failed')))
  with check (exists (select 1 from public.orders o
                      where o.id = order_items.order_id and public.is_counter_staff(o.branch_id)
                        and o.status in ('pending', 'confirmed') and o.payment_status in ('unpaid', 'failed')));

create policy "Customers add items to their new order" on public.order_items for insert to authenticated
  with check (exists (select 1 from public.orders o
                      where o.id = order_items.order_id and o.customer_id = auth.uid()
                        and o.status = 'pending' and o.payment_status = 'unpaid'));

create policy "Customers submit GCash payments" on public.payments for insert to authenticated
  with check (provider = 'gcash' and status = 'processing' and verified_by is null
              and exists (select 1 from public.orders o
                          where o.id = payments.order_id and o.customer_id = auth.uid() and o.payment_method = 'gcash'));

create policy "Riders record cash on delivery" on public.payments for insert to authenticated
  with check (provider = 'cash' and status = 'paid' and public.auth_role() = 'rider' and public.is_active_user()
              and exists (select 1 from public.orders o where o.id = payments.order_id and o.rider_id = auth.uid()));

create policy "Riders supersede waiting GCash submissions" on public.payments for update to authenticated
  using (provider = 'gcash' and status = 'processing' and public.auth_role() = 'rider'
         and exists (select 1 from public.orders o where o.id = payments.order_id and o.rider_id = auth.uid()))
  with check (provider = 'gcash' and status = 'failed');
