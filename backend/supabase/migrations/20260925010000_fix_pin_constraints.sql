-- The map-pin CHECKs from 20260925000000 let a lone latitude (or longitude)
-- through: with one key missing, jsonb_typeof(...) = 'number' is NULL, and a
-- CHECK that evaluates to NULL passes. Treat "missing" as "not a number".

-- One stray row made it in while the old constraint was broken: a test order
-- ("X", address a/b) with a latitude and no longitude. Remove exactly that row so
-- the corrected constraint can be added; nothing else is touched.
delete from public.orders
where id = '4c54f4eb-eb2d-40a5-8b4d-0a2b4ab6339c'
  and customer_name = 'X'
  and delivery_address = '{"city":"b","line1":"a","latitude":14.3}'::jsonb;

alter table public.orders drop constraint if exists orders_delivery_pin_valid;
alter table public.orders
  add constraint orders_delivery_pin_valid check (
    delivery_address is null
    or (not (delivery_address ? 'latitude') and not (delivery_address ? 'longitude'))
    or (
      coalesce(jsonb_typeof(delivery_address -> 'latitude') = 'number', false)
      and coalesce(jsonb_typeof(delivery_address -> 'longitude') = 'number', false)
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
      coalesce(jsonb_typeof(default_address -> 'latitude') = 'number', false)
      and coalesce(jsonb_typeof(default_address -> 'longitude') = 'number', false)
      and (default_address ->> 'latitude')::numeric between -90 and 90
      and (default_address ->> 'longitude')::numeric between -180 and 180
    )
  );
