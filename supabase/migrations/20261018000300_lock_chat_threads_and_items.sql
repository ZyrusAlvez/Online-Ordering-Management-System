-- Two loose ends from the browser-writes migration:
--
-- 1. A participant in a delivery chat could update any column of its thread (its branch, kind,
--    order...), because the update policy only checks who may touch the row. Now only the
--    "last message" preview can change, and only the branch's staff can mark a thread read.
-- 2. A customer could keep adding items to their own order while it was pending and unpaid.
--    Now a customer's items can only be added in the transaction that first fills the order
--    (the app inserts all lines in one request). Staff still edit items before payment.

-- ---------------------------------------------------------------------------
-- Chat threads
-- ---------------------------------------------------------------------------

create or replace function public.guard_chat_thread() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  if not public.is_client_request() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A thread opened from the browser starts empty; the preview fills in as messages arrive.
    new.visitor_name := null;
    new.staff_read_at := null;
    new.last_message := null;
    new.last_sender_role := null;
    new.last_message_at := now();
    return new;
  end if;

  if new.id <> old.id or new.kind <> old.kind or new.order_id is distinct from old.order_id
     or new.branch_id <> old.branch_id or new.guest_number <> old.guest_number
     or new.visitor_name is distinct from old.visitor_name or new.created_at <> old.created_at then
    raise exception 'That part of a conversation cannot be changed' using errcode = '42501';
  end if;
  if new.staff_read_at is distinct from old.staff_read_at and not public.is_counter_staff(old.branch_id) then
    raise exception 'Only the branch''s staff can mark a conversation read' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger chat_threads_guard before insert or update on public.chat_threads
  for each row execute function public.guard_chat_thread();

-- ---------------------------------------------------------------------------
-- Order items: priced from the menu (as before), and a customer cannot add to a placed order
-- ---------------------------------------------------------------------------

create or replace function public.price_order_item() returns trigger
  language plpgsql set search_path = ''
as $$
declare
  v_product record;
  v_variant record;
  v_branch uuid;
begin
  if not public.is_client_request() then
    return new;
  end if;

  select o.branch_id into v_branch from public.orders o where o.id = new.order_id;

  -- The database stamps the time, so an earlier batch cannot be made to look like this one.
  new.created_at := now();

  -- Items already saved by an earlier request mean the order was placed. now() is the time this
  -- transaction began, so every line of the batch that places the order shares it.
  if tg_op = 'INSERT' and not public.is_counter_staff(v_branch)
     and exists (select 1 from public.order_items i where i.order_id = new.order_id and i.created_at < now()) then
    raise exception 'Items can only be added when the order is placed' using errcode = '42501';
  end if;

  select p.id, p.name, p.price, p.is_available into v_product from public.products p where p.id = new.product_id;
  if not found then
    raise exception 'Unknown product' using errcode = '23514';
  end if;
  if not v_product.is_available then
    raise exception 'Product is unavailable: %', v_product.name using errcode = '23514';
  end if;
  if exists (select 1 from public.branch_unavailable_products b where b.branch_id = v_branch and b.product_id = new.product_id) then
    raise exception 'Sold out at this branch: %', v_product.name using errcode = '23514';
  end if;

  new.unit_price := v_product.price;
  if new.variant_id is not null then
    select v.price into v_variant from public.product_variants v where v.id = new.variant_id and v.product_id = new.product_id;
    if not found then
      raise exception 'That option does not belong to %', v_product.name using errcode = '23514';
    end if;
    new.unit_price := v_variant.price;
  end if;
  if new.unit_price is null then
    raise exception 'Price not yet set for %', v_product.name using errcode = '23514';
  end if;
  return new;
end;
$$;
