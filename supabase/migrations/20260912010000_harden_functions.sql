-- Security hardening for the functions added in 20260912000000.
--
-- Three issues flagged by the Supabase security advisor:
--   1. Mutable search_path on all three functions — a caller could shadow an
--      unqualified name and have the function resolve to their own object.
--   2. handle_new_user() is SECURITY DEFINER and was reachable by anon and
--      authenticated via /rest/v1/rpc/handle_new_user. It is a trigger
--      function and must never be callable directly.
--   3. next_order_number() was callable by any signed-in user, who could burn
--      the daily sequence. It is only ever called by the orders trigger.

create or replace function public.auth_role() returns text
language sql stable security invoker set search_path = '' as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'customer')
$$;

create or replace function public.next_order_number(p_channel text) returns text
language plpgsql security invoker set search_path = '' as $$
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

create or replace function public.set_order_number() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.order_number is null then
    new.order_number := public.next_order_number(new.channel::text);
  end if;
  return new;
end $$;

-- These three are internal: triggers and RLS helpers, never public RPC.
revoke all on function public.handle_new_user()            from anon, authenticated;
revoke all on function public.set_order_number()           from anon, authenticated;
revoke all on function public.next_order_number(text)      from anon, authenticated;

-- auth_role() stays executable: RLS policies evaluate it as the calling role.
