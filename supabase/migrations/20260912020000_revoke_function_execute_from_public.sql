-- Postgres grants EXECUTE on new functions to PUBLIC by default, so the
-- revokes in 20260912010000 (which named only anon and authenticated) left the
-- inherited PUBLIC grant in place and had no effect. Revoke from PUBLIC.

revoke all on function public.handle_new_user()       from public, anon, authenticated;
revoke all on function public.set_order_number()      from public, anon, authenticated;
revoke all on function public.next_order_number(text) from public, anon, authenticated;

-- The trigger owner still executes these; triggers do not consult EXECUTE
-- grants for the invoking user, so order creation is unaffected.
