-- 1. Rate limits. The Express server counted attempts in its own memory; on Vercel every request
--    can land on a fresh instance, so the counters live here instead. Only the server (secret key)
--    uses them: src/controllers/server/rateLimit.ts.
-- 2. The ordering rules for an online order (branch open and taking orders, a valid time, an
--    address and number for delivery) were checked only by the app before inserting from the
--    browser. Someone calling the API directly with their own login could skip them. Now the
--    database checks them too, with the same messages.

-- ---------------------------------------------------------------------------
-- Rate limits
-- ---------------------------------------------------------------------------

-- One row per "rule:who" (e.g. "kiosk-gate:203.0.113.7"): hits in the current fixed window.
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits integer not null
);

-- No policies: browsers can neither read nor write it.
alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from anon, authenticated;

-- Counts one attempt and returns the attempts in the current window, this one included.
create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer) returns integer
  language sql set search_path = ''
as $$
  insert into public.rate_limits as r (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then now() else r.window_start end,
    hits = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end
  returning hits
$$;

-- The attempts in the current window, without counting one.
create or replace function public.rate_limit_count(p_key text, p_window_seconds integer) returns integer
  language sql stable set search_path = ''
as $$
  select coalesce(
    (select r.hits from public.rate_limits r
      where r.key = p_key and r.window_start > now() - make_interval(secs => p_window_seconds)),
    0)
$$;

revoke execute on function public.rate_limit_hit(text, integer) from public, anon, authenticated;
revoke execute on function public.rate_limit_count(text, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer) to service_role;
grant execute on function public.rate_limit_count(text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Online order rules (the port of orderTimeProblem in src/utils/schedule.ts)
-- ---------------------------------------------------------------------------

-- Errors use SQLSTATE P0001, which the app shows to the customer as written (fromDbError).
create or replace function public.check_online_order() returns trigger
  language plpgsql set search_path = ''
as $$
declare
  v_branch record;
  v_slot time;
begin
  -- Kiosk orders come through the server, counter orders are staff: only browser checkouts here.
  if not public.is_client_request() or new.channel <> 'online' then
    return new;
  end if;

  select b.name, b.is_active, b.opens_at, b.closes_at into v_branch from public.branches b where b.id = new.branch_id;
  if not found or not v_branch.is_active then
    raise exception 'That branch is not taking orders' using errcode = 'P0001';
  end if;

  if new.fulfillment_type = 'delivery'
     and (new.delivery_address is null or coalesce(btrim(new.customer_phone), '') = '') then
    raise exception 'A delivery needs an address and a mobile number' using errcode = 'P0001';
  end if;

  -- ASAP: only while the branch is open (no hours set means open all day).
  if new.scheduled_for is null then
    v_slot := (now() at time zone 'Asia/Manila')::time;
    if v_branch.opens_at is not null and v_branch.closes_at is not null
       and not (v_slot >= v_branch.opens_at and v_slot < v_branch.closes_at) then
      raise exception '% is closed now. Schedule your order for later.', v_branch.name using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- Scheduled: a 15-minute mark, at least 30 minutes ahead (5 minutes' grace here for a phone
  -- whose clock runs a little behind), up to 2 Manila days ahead, inside the branch's hours.
  if extract(second from new.scheduled_for) <> 0 or extract(minute from new.scheduled_for)::integer % 15 <> 0 then
    raise exception 'Choose a time on a 15-minute mark, e.g. 3:15 PM' using errcode = 'P0001';
  end if;
  if new.scheduled_for < now() + interval '25 minutes' then
    raise exception 'Schedule at least 30 minutes ahead' using errcode = 'P0001';
  end if;
  if (new.scheduled_for at time zone 'Asia/Manila')::date > (now() at time zone 'Asia/Manila')::date + 2 then
    raise exception 'Orders can be scheduled up to 2 days ahead' using errcode = 'P0001';
  end if;
  v_slot := (new.scheduled_for at time zone 'Asia/Manila')::time;
  if v_branch.opens_at is not null and v_branch.closes_at is not null
     and not (v_slot >= v_branch.opens_at and v_slot < v_branch.closes_at) then
    raise exception '% is closed at that time', v_branch.name using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_online_order() from public, anon, authenticated;

create trigger orders_online_rules before insert on public.orders
  for each row execute function public.check_online_order();
