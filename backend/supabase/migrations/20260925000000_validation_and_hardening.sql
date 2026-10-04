-- Validation rules, and fixes for three data-integrity/security bugs.
--
-- 1. Order numbers (K-0001, O-0042 ...) restart every business day, but the
--    column was globally unique, so the first order of the next day would
--    collide with yesterday's and the channel could never issue another number.
--    Uniqueness is now per number per Manila business day.
-- 2. The init schema let a customer INSERT/UPDATE their own `orders` rows (and
--    insert `order_items` with any price) straight through the public API key,
--    bypassing server-side pricing and payment: a free order, or a self-set
--    "paid". All order writes go through the API (secret key); only reads stay.
-- 3. A cash payment can only be recorded once per order.
-- Plus: the same format/length limits the API and the forms enforce, so bad data
-- cannot get in from a script either, and the inbox preview columns for chat.

-- 1. order numbers unique per business day --------------------------------------
alter table public.orders drop constraint if exists orders_order_number_key;
create unique index if not exists orders_order_number_day_key
  on public.orders (order_number, ((created_at at time zone 'Asia/Manila')::date));

-- 2. orders and their items are written by the API only --------------------------
drop policy if exists "Customers create their own orders" on public.orders;
drop policy if exists "Customers cancel their own pending orders" on public.orders;
drop policy if exists "Customers insert items on their own orders" on public.order_items;

-- 3. one cash payment per order ---------------------------------------------------
create unique index if not exists payments_one_cash_per_order
  on public.payments (order_id) where provider = 'cash' and status = 'paid';

-- Phone numbers: exactly 11 digits, starting 09 (e.g. 09171234567) ---------------
alter table public.profiles drop constraint if exists profiles_phone_format;
alter table public.profiles
  add constraint profiles_phone_format check (phone is null or phone ~ '^09[0-9]{9}$');

alter table public.orders drop constraint if exists orders_customer_phone_format;
alter table public.orders
  add constraint orders_customer_phone_format
  check (customer_phone is null or customer_phone ~ '^09[0-9]{9}$');

-- Text lengths --------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_full_name_length;
alter table public.profiles
  add constraint profiles_full_name_length
  check (full_name is null or char_length(btrim(full_name)) between 1 and 120);

alter table public.orders drop constraint if exists orders_customer_name_length;
alter table public.orders
  add constraint orders_customer_name_length
  check (customer_name is null or char_length(btrim(customer_name)) between 1 and 120);

alter table public.orders drop constraint if exists orders_notes_length;
alter table public.orders
  add constraint orders_notes_length check (notes is null or char_length(notes) <= 1000);

alter table public.orders drop constraint if exists orders_void_reason_length;
alter table public.orders
  add constraint orders_void_reason_length check (void_reason is null or char_length(void_reason) <= 500);

alter table public.categories drop constraint if exists categories_name_length;
alter table public.categories
  add constraint categories_name_length check (char_length(btrim(name)) between 1 and 100);

alter table public.products drop constraint if exists products_name_length;
alter table public.products
  add constraint products_name_length check (char_length(btrim(name)) between 1 and 200);

alter table public.products drop constraint if exists products_description_length;
alter table public.products
  add constraint products_description_length check (description is null or char_length(description) <= 2000);

alter table public.product_variants drop constraint if exists product_variants_label_length;
alter table public.product_variants
  add constraint product_variants_label_length check (char_length(btrim(label)) between 1 and 100);

-- Amounts and quantities -----------------------------------------------------------
alter table public.products drop constraint if exists products_price_max;
alter table public.products
  add constraint products_price_max check (price is null or price <= 999999.99);

alter table public.product_variants drop constraint if exists product_variants_price_max;
alter table public.product_variants
  add constraint product_variants_price_max check (price is null or price <= 999999.99);

alter table public.orders drop constraint if exists orders_total_amount_max;
alter table public.orders
  add constraint orders_total_amount_max check (total_amount <= 999999.99);

alter table public.order_items drop constraint if exists order_items_quantity_max;
alter table public.order_items
  add constraint order_items_quantity_max check (quantity <= 99);

-- Map pin: latitude and longitude go together and must be real coordinates ---------
alter table public.orders drop constraint if exists orders_delivery_pin_valid;
alter table public.orders
  add constraint orders_delivery_pin_valid check (
    delivery_address is null
    or (not (delivery_address ? 'latitude') and not (delivery_address ? 'longitude'))
    or (
      jsonb_typeof(delivery_address -> 'latitude') = 'number'
      and jsonb_typeof(delivery_address -> 'longitude') = 'number'
      and (delivery_address ->> 'latitude')::numeric between -90 and 90
      and (delivery_address ->> 'longitude')::numeric between -180 and 180
    )
  );

alter table public.profiles drop constraint if exists profiles_default_address_pin_valid;
alter table public.profiles
  add constraint profiles_default_address_pin_valid check (
    default_address is null
    or (not (default_address ? 'latitude') and not (default_address ? 'longitude'))
    or (
      jsonb_typeof(default_address -> 'latitude') = 'number'
      and jsonb_typeof(default_address -> 'longitude') = 'number'
      and (default_address ->> 'latitude')::numeric between -90 and 90
      and (default_address ->> 'longitude')::numeric between -180 and 180
    )
  );

-- Chat inbox preview: stored on the thread instead of scanning recent messages ----
alter table public.chat_threads
  add column if not exists last_message text,
  add column if not exists last_sender_role text;

update public.chat_threads t
set last_message = m.body, last_sender_role = m.sender_role
from (
  select distinct on (thread_id) thread_id, body, sender_role
  from public.chat_messages
  order by thread_id, created_at desc
) m
where m.thread_id = t.id;
