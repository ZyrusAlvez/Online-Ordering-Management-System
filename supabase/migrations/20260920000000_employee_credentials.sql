-- Employee passwords for the staff-facing /kiosk gate.
--
-- The cashier password is not stored here: it is the Supabase Auth password of
-- the shared cashier account, so it is changed through the Auth admin API.
-- The kiosk has no Supabase user, so its password is kept as a salted scrypt
-- hash. RLS is enabled with no policies, so only the secret (service) key can
-- read or write it — never a browser.

create table if not exists public.employee_credentials (
  role          text primary key check (role in ('kiosk')),
  password_hash text not null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null
);

alter table public.employee_credentials enable row level security;
