-- Saved delivery address for the customer profile page, and a fix for profile writes.
--
-- The "Users update own profile" policy let anyone holding a session write ANY
-- column of their own row straight to Supabase with the public key, including
-- role and is_active (a deactivated rider could simply switch themselves back
-- on). Profiles are now edited only through the API (secret key), which
-- whitelists name, phone and address. With RLS on and no update policy, direct
-- updates from a browser are refused.

alter table public.profiles add column if not exists default_address jsonb;

drop policy if exists "Users update own profile" on public.profiles;
