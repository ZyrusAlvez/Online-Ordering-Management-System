-- Realtime chat.
--
--   support  - anyone on the landing page (no account) <-> the cashier
--   delivery - an online customer <-> the rider holding their order
--
-- Writes go through the API with the secret key, so RLS here is SELECT-only and
-- exists to scope what Realtime delivers. Visitors have no JWT and therefore no
-- policy: they read through the API with their thread token instead.

create table if not exists public.chat_threads (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('support', 'delivery')),
  order_id        uuid unique references public.orders (id) on delete cascade,
  visitor_name    text check (visitor_name is null or char_length(visitor_name) <= 60),
  last_message_at timestamptz not null default now(),
  -- When staff last opened the thread; unread = last visitor message is newer.
  staff_read_at   timestamptz,
  created_at      timestamptz not null default now(),
  check ((kind = 'support' and order_id is null) or (kind = 'delivery' and order_id is not null))
);

-- Kept apart from chat_threads so the hash is never part of a Realtime payload
-- or any row a browser can read. RLS on, no policies: secret key only.
create table if not exists public.chat_thread_secrets (
  thread_id  uuid primary key references public.chat_threads (id) on delete cascade,
  token_hash text not null
);

create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.chat_threads (id) on delete cascade,
  sender_role text not null check (sender_role in ('visitor', 'customer', 'cashier', 'rider')),
  sender_id   uuid references auth.users (id) on delete set null,
  body        text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at  timestamptz not null default now()
);

create index if not exists chat_messages_thread_idx on public.chat_messages (thread_id, created_at);
create index if not exists chat_threads_inbox_idx on public.chat_threads (kind, last_message_at desc);

alter table public.chat_threads enable row level security;
alter table public.chat_thread_secrets enable row level security;
alter table public.chat_messages enable row level security;

create policy "Chat threads visible to staff and the order's customer or rider"
  on public.chat_threads for select
  using (
    public.auth_role() in ('cashier', 'admin')
    or (
      kind = 'delivery'
      and exists (
        select 1 from public.orders o
        where o.id = chat_threads.order_id
          and (
            o.customer_id = auth.uid()
            or (public.auth_role() = 'rider' and o.rider_id = auth.uid())
          )
      )
    )
  );

create policy "Chat messages follow their thread"
  on public.chat_messages for select
  using (
    public.auth_role() in ('cashier', 'admin')
    or exists (
      select 1
      from public.chat_threads t
      join public.orders o on o.id = t.order_id
      where t.id = chat_messages.thread_id
        and t.kind = 'delivery'
        and (
          o.customer_id = auth.uid()
          or (public.auth_role() = 'rider' and o.rider_id = auth.uid())
        )
    )
  );

do $$ begin
  alter publication supabase_realtime add table public.chat_threads;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object then null; end $$;
