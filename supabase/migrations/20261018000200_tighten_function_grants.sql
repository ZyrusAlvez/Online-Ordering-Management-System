-- Advisor cleanup: anon never needs is_active_user (every write policy is for signed-in users),
-- and a trigger function needs no EXECUTE grant to fire.
revoke execute on function public.is_active_user() from public, anon;
revoke execute on function public.recompute_order_total() from public, anon, authenticated;
