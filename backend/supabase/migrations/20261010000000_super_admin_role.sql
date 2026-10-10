-- The super admin manages every branch; an admin manages only the branches it is
-- assigned to (see 20261010010000_branches.sql).
--
-- Kept in its own migration: Postgres cannot use an enum value in the same
-- transaction that adds it, and the branches migration promotes existing admins.

alter type public.user_role add value if not exists 'super_admin';
