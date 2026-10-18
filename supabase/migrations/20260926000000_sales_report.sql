-- Sales report for the admin dashboard.
--
-- What counts as a sale: an order that has been PAID and has not been voided or
-- cancelled. That is money actually collected on a live order. It is counted when
-- it is paid, not when it is completed: a kiosk GCash order or a counter cash order
-- is paid long before the kitchen finishes it, and a completed order cannot be voided,
-- so a paid, non-voided order is never reversed afterwards. Refunded orders are
-- voided, so they drop out on their own; voided orders still waiting on a refund are
-- reported separately as `refunds_pending` instead of being counted as revenue.
--
-- Days are Manila days (Asia/Manila, UTC+8, no daylight saving), like order numbers,
-- so a 9pm order lands on today's report and not tomorrow's. Orders are placed on the
-- day they were created; a delivery paid in cash after midnight counts on the day it
-- was ordered.
--
-- Aggregating here rather than in the API matters because PostgREST returns at most
-- 1000 rows per request, which a busy month of orders and their items would exceed.

create index if not exists orders_created_at_idx on public.orders (created_at);

create or replace function public.sales_report(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with sales as (
    select o.id,
           o.total_amount,
           o.channel::text as channel,
           coalesce(o.payment_method::text, 'unknown') as method,
           (o.created_at at time zone 'Asia/Manila')::date as day
    from public.orders o
    where o.payment_status = 'paid'
      and o.status not in ('voided', 'cancelled')
      and o.created_at >= p_from
      and o.created_at < p_to
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

-- Only the API (secret key) may run it, behind the admin role check. Revoke from
-- `public` too: functions are executable by everyone by default, and naming only
-- anon and authenticated does not remove that (see 20260912020000).
revoke all on function public.sales_report(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.sales_report(timestamptz, timestamptz) to service_role;
