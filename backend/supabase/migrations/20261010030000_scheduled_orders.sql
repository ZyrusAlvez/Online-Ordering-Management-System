-- Scheduled online orders.
--
-- An online customer may ask for their order at a later time (pickup or
-- delivery) instead of as soon as possible. The API decides which times are
-- allowed (15-minute slots, inside the branch's hours, up to two days ahead);
-- the database only keeps it to online orders. The cashier's queue sorts and
-- highlights by it.

alter table public.orders add column scheduled_for timestamptz;

alter table public.orders
  add constraint orders_scheduled_online_only check (scheduled_for is null or channel = 'online');

create index orders_branch_scheduled_idx on public.orders (branch_id, scheduled_for)
  where scheduled_for is not null;
