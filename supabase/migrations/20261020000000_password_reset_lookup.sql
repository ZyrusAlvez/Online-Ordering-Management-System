-- Forgot password checks the address before emailing a code: is there an account, can it have a
-- password reset (not Google-only, not the shared cashier login), and is it active? auth.users is
-- not readable through the API, so this looks it up. Only the server (secret key) may call it.

create or replace function public.password_reset_target(p_email text)
returns table (id uuid, role text, is_active boolean, has_password boolean)
  language sql stable security definer set search_path = ''
as $$
  select u.id,
         coalesce(u.raw_app_meta_data ->> 'role', 'customer'),
         coalesce(p.is_active, true),
         exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email')
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.email = lower(trim(p_email)) and u.deleted_at is null
  limit 1;
$$;

revoke execute on function public.password_reset_target(text) from public, anon, authenticated;
grant execute on function public.password_reset_target(text) to service_role;
