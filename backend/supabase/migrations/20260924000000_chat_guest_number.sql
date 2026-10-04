-- A short, stable number per visitor conversation, so staff can tell several
-- anonymous guests apart ("Guest-1023"). Existing threads are numbered too.
alter table public.chat_threads
  add column if not exists guest_number integer generated always as identity (start with 1001);
