-- Per-branch "sold out".
--
-- The menu and its prices are shared by every branch (the super admin edits
-- them). What differs is what a branch has run out of today: a row here hides
-- the product at that branch only. products.is_available still switches a dish
-- off everywhere.

create table public.branch_unavailable_products (
  branch_id  uuid not null references public.branches (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (branch_id, product_id)
);

create index branch_unavailable_products_product_idx on public.branch_unavailable_products (product_id);

-- Public like the menu itself; writes go through the API's secret key.
alter table public.branch_unavailable_products enable row level security;

create policy "Branch availability is publicly readable" on public.branch_unavailable_products
  for select using (true);
