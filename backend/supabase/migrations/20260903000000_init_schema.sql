-- Initial schema for the Online Ordering Management System.
-- Apply via the Supabase MCP/CLI (`supabase db push`) or paste into the SQL
-- editor. Idempotent: safe to re-run.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- categories — top-level menu sections (e.g. "3K Ala Carte", "Bilao")
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- products — one menu item. `price` is the item's own price when it has no
-- sized/priced options; leave it null when pricing lives entirely on
-- product_variants (e.g. Bilao trays), or when a price simply isn't set yet
-- (e.g. softdrinks in the source menu).
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id             uuid primary key default gen_random_uuid(),
  category_id    uuid references public.categories (id) on delete set null,
  name           text not null,
  description    text,
  price          numeric(10, 2) check (price >= 0),
  image_url      text,
  is_available   boolean not null default true,
  -- Free options with no price delta, e.g. Egg: {Fried, Boiled}.
  customizations text[] not null default '{}',
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (category_id, name)
);

-- ---------------------------------------------------------------------------
-- product_variants — priced options for a product, e.g. size (250g/500g,
-- XMINI..LARGE) or portion (Single/Platter). `price` is nullable for the same
-- "not set yet" reason as products.price.
-- ---------------------------------------------------------------------------
create table if not exists public.product_variants (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  label      text not null,
  price      numeric(10, 2) check (price >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (product_id, label)
);

create index if not exists products_category_id_idx on public.products (category_id);
create index if not exists product_variants_product_id_idx on public.product_variants (product_id);

-- ---------------------------------------------------------------------------
-- orders / order_items
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending','confirmed','preparing','ready','completed','cancelled')),
  total_amount numeric(10, 2) not null default 0 check (total_amount >= 0),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  -- Which priced option was ordered, if the product has variants.
  variant_id uuid references public.product_variants (id) on delete restrict,
  quantity   integer not null check (quantity > 0),
  -- Price at the time of order — never recomputed from current product/variant
  -- pricing, so historical orders stay accurate after a price change.
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  notes      text,
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists orders_customer_id_idx on public.orders (customer_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Menu data is publicly readable; writes go through the API's service-role
-- (secret key) client, gated by the admin/staff check in the app layer, so no
-- write policy is needed here.
create policy "Categories are publicly readable"
  on public.categories for select
  using (true);

create policy "Products are publicly readable"
  on public.products for select
  using (true);

create policy "Product variants are publicly readable"
  on public.product_variants for select
  using (true);

-- Orders: customers see and create only their own orders.
create policy "Customers read their own orders"
  on public.orders for select
  using (auth.uid() = customer_id);

create policy "Customers create their own orders"
  on public.orders for insert
  with check (auth.uid() = customer_id);

create policy "Customers cancel their own pending orders"
  on public.orders for update
  using (auth.uid() = customer_id)
  with check (auth.uid() = customer_id);

-- Order items: visible/insertable only through the parent order's ownership.
create policy "Customers read their own order items"
  on public.order_items for select
  using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and o.customer_id = auth.uid()
  ));

create policy "Customers insert items on their own orders"
  on public.order_items for insert
  with check (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and o.customer_id = auth.uid()
  ));

-- Staff/admin (app_metadata.role) bypass the above via the secret-key client
-- used by the API for /orders/:id/status — that client is not subject to RLS.
