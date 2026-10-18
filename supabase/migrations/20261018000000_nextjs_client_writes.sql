-- Browser writes for the Next.js app (see docs/data-dictionary.md, "Who can read and write what").
--
-- Express wrote every row with the secret key, so the tables only had SELECT policies. The Next.js
-- app writes from the browser like Pasuyo, so this adds the write policies, plus triggers that keep
-- the money rules the server used to enforce: prices come from the menu, totals come from the
-- items, and a customer cannot mark their own order paid.
--
-- Server-side code (kiosk orders, staff accounts, visitor chat) still uses the secret key and is
-- not affected: the guard triggers only act on requests made as `anon` or `authenticated`.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- A deactivated account loses write access straight away, not when its token expires.
create or replace function public.is_active_user() returns boolean
  language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.is_active from public.profiles p where p.id = auth.uid()), false)
$$;

create or replace function public.is_super_admin() returns boolean
  language sql stable set search_path = ''
as $$
  select public.auth_role() = 'super_admin' and public.is_active_user()
$$;

-- Counter work at a branch: cashier, admin or super admin.
create or replace function public.is_counter_staff(p_branch uuid) returns boolean
  language sql stable set search_path = ''
as $$
  select public.auth_role() in ('cashier', 'admin', 'super_admin')
     and public.has_branch_access(p_branch)
     and public.is_active_user()
$$;

-- Branch-level admin work (sold-out switches).
create or replace function public.is_branch_admin(p_branch uuid) returns boolean
  language sql stable set search_path = ''
as $$
  select public.auth_role() in ('admin', 'super_admin')
     and public.has_branch_access(p_branch)
     and public.is_active_user()
$$;

-- True only for requests from the browser keys; the secret key (service_role) skips the guards.
create or replace function public.is_client_request() returns boolean
  language sql stable set search_path = ''
as $$
  select current_user in ('anon', 'authenticated')
$$;

grant execute on function public.is_active_user(), public.is_super_admin(), public.is_counter_staff(uuid),
  public.is_branch_admin(uuid), public.is_client_request() to anon, authenticated;

-- Order numbers: the trigger writes order_counters, which has no policies. Run it as its owner.
alter function public.set_order_number() security definer;

-- ---------------------------------------------------------------------------
-- Money guards
-- ---------------------------------------------------------------------------

-- Every new line is priced from the menu; whatever unit_price the browser sent is ignored.
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

create trigger order_items_price before insert or update on public.order_items
  for each row execute function public.price_order_item();

-- The order total is always the sum of its items.
create or replace function public.recompute_order_total() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_order uuid := coalesce(new.order_id, old.order_id);
begin
  update public.orders o
     set total_amount = coalesce((select sum(i.unit_price * i.quantity) from public.order_items i where i.order_id = v_order), 0)
   where o.id = v_order;
  return null;
end;
$$;

create trigger order_items_total after insert or update or delete on public.order_items
  for each row execute function public.recompute_order_total();

-- What a browser may do to an order row. Staff at the branch may change anything except who and
-- where the order belongs to; customers and riders only the moves the app offers them.
create or replace function public.guard_order() returns trigger
  language plpgsql set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := public.auth_role();
  v_free text[];
  v_changed boolean;
begin
  if not public.is_client_request() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A new order always starts unpaid with nothing in it; items set the total.
    new.status := 'pending';
    new.payment_status := 'unpaid';
    new.total_amount := 0;
    new.rider_id := null;
    new.claimed_at := null;
    new.delivered_at := null;
    new.voided_at := null;
    new.voided_by := null;
    new.void_reason := null;
    new.kiosk_device_id := null;
    return new;
  end if;

  -- UPDATE: these never change, and the total is never taken from the browser.
  if new.id <> old.id or new.branch_id <> old.branch_id or new.channel <> old.channel
     or new.customer_id is distinct from old.customer_id or new.kiosk_device_id is distinct from old.kiosk_device_id
     or new.order_number is distinct from old.order_number or new.created_at <> old.created_at then
    raise exception 'That part of an order cannot be changed' using errcode = '42501';
  end if;
  new.total_amount := coalesce((select sum(i.unit_price * i.quantity) from public.order_items i where i.order_id = new.id), 0);

  if public.is_counter_staff(old.branch_id) then
    return new;
  end if;

  if v_role = 'rider' and public.is_active_user() then
    v_free := array['rider_id', 'status', 'claimed_at', 'delivered_at', 'payment_status', 'payment_method', 'updated_at', 'total_amount'];
    v_changed := (to_jsonb(new) - v_free) <> (to_jsonb(old) - v_free);
    if v_changed or old.fulfillment_type <> 'delivery' then
      raise exception 'Riders can only claim, return and deliver orders' using errcode = '42501';
    end if;
    if (old.status = 'ready' and old.rider_id is null and new.status = 'out_for_delivery' and new.rider_id = v_uid)   -- claim
       or (old.rider_id = v_uid and old.status = 'out_for_delivery' and new.status = 'ready' and new.rider_id is null) -- unclaim
       or (old.rider_id = v_uid and old.status = 'out_for_delivery' and new.rider_id = v_uid
           and new.status in ('out_for_delivery', 'completed')
           -- cash on delivery: the rider may only record it as paid in cash
           and (new.payment_status = old.payment_status
                or (new.payment_status = 'paid' and new.payment_method = 'cash'
                    and old.payment_status not in ('paid', 'refund_pending', 'refunded', 'refund_failed')))) then
      return new;
    end if;
    raise exception 'That delivery change is not allowed' using errcode = '42501';
  end if;

  if old.customer_id = v_uid then
    v_free := array['status', 'payment_status', 'updated_at', 'total_amount'];
    v_changed := (to_jsonb(new) - v_free) <> (to_jsonb(old) - v_free);
    if not v_changed then
      -- cancel an unstarted, unpaid order
      if new.status = 'cancelled' and old.status in ('pending', 'confirmed')
         and old.payment_status in ('unpaid', 'failed') and new.payment_status = old.payment_status then
        return new;
      end if;
      -- "I've paid by GCash": waits for staff to verify
      if new.status = old.status and old.payment_method = 'gcash' and old.status not in ('voided', 'cancelled')
         and old.payment_status in ('unpaid', 'failed') and new.payment_status = 'processing' then
        return new;
      end if;
      -- undo the above if the payment row could not be saved
      if new.status = old.status and old.payment_status = 'processing' and new.payment_status in ('unpaid', 'failed')
         and not exists (select 1 from public.payments p where p.order_id = old.id and p.status = 'processing') then
        return new;
      end if;
      if new.status = old.status and new.payment_status = old.payment_status then
        return new;
      end if;
    end if;
    raise exception 'You can only cancel your order or send your GCash payment' using errcode = '42501';
  end if;

  raise exception 'You cannot change this order' using errcode = '42501';
end;
$$;

create trigger orders_guard before insert or update on public.orders
  for each row execute function public.guard_order();

-- A payment's amount is the order's total, whatever the browser sent.
create or replace function public.guard_payment() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  if public.is_client_request() then
    new.amount_centavos := (select round(o.total_amount * 100)::int from public.orders o where o.id = new.order_id);
  end if;
  return new;
end;
$$;

create trigger payments_guard before insert on public.payments
  for each row execute function public.guard_payment();

-- ---------------------------------------------------------------------------
-- Orders, items, payments
-- ---------------------------------------------------------------------------

create policy "Customers place online orders" on public.orders for insert to authenticated
  with check (channel = 'online' and customer_id = auth.uid() and public.auth_role() = 'customer');

create policy "Counter staff place walk-in orders" on public.orders for insert to authenticated
  with check (channel = 'pos' and public.is_counter_staff(branch_id));

create policy "Customers update own orders" on public.orders for update to authenticated
  using (customer_id = auth.uid()) with check (customer_id = auth.uid());

create policy "Counter staff update their branches' orders" on public.orders for update to authenticated
  using (public.is_counter_staff(branch_id)) with check (public.is_counter_staff(branch_id));

create policy "Riders claim and deliver" on public.orders for update to authenticated
  using (
    public.auth_role() = 'rider' and public.is_active_user() and fulfillment_type = 'delivery'
    and (rider_id = auth.uid() or (rider_id is null and status = 'ready' and public.has_branch_access(branch_id)))
  )
  with check (
    fulfillment_type = 'delivery' and public.has_branch_access(branch_id)
    and (rider_id = auth.uid() or rider_id is null)
  );

-- Only to roll back an order whose items failed to save.
create policy "Delete an empty new order" on public.orders for delete to authenticated
  using (
    status = 'pending' and payment_status = 'unpaid'
    and not exists (select 1 from public.order_items i where i.order_id = orders.id)
    and (customer_id = auth.uid() or (channel = 'pos' and public.is_counter_staff(branch_id)))
  );

create policy "Customers add items to their new order" on public.order_items for insert to authenticated
  with check (exists (
    select 1 from public.orders o
    where o.id = order_id and o.customer_id = auth.uid()
      and o.status = 'pending' and o.payment_status = 'unpaid'
  ));

create policy "Counter staff edit items before payment" on public.order_items for all to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and public.is_counter_staff(o.branch_id)
      and o.status in ('pending', 'confirmed') and o.payment_status in ('unpaid', 'failed')
  ))
  with check (exists (
    select 1 from public.orders o
    where o.id = order_id and public.is_counter_staff(o.branch_id)
      and o.status in ('pending', 'confirmed') and o.payment_status in ('unpaid', 'failed')
  ));

create policy "Customers submit GCash payments" on public.payments for insert to authenticated
  with check (
    provider = 'gcash' and status = 'processing' and verified_by is null
    and exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid() and o.payment_method = 'gcash')
  );

create policy "Counter staff record payments" on public.payments for insert to authenticated
  with check (exists (select 1 from public.orders o where o.id = order_id and public.is_counter_staff(o.branch_id)));

create policy "Counter staff update payments" on public.payments for update to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and public.is_counter_staff(o.branch_id)))
  with check (exists (select 1 from public.orders o where o.id = order_id and public.is_counter_staff(o.branch_id)));

create policy "Riders record cash on delivery" on public.payments for insert to authenticated
  with check (
    provider = 'cash' and status = 'paid' and public.auth_role() = 'rider' and public.is_active_user()
    and exists (select 1 from public.orders o where o.id = order_id and o.rider_id = auth.uid())
  );

create policy "Riders read payments of orders they hold" on public.payments for select to authenticated
  using (public.auth_role() = 'rider' and exists (select 1 from public.orders o where o.id = order_id and o.rider_id = auth.uid()));

-- Cash on delivery replaces a GCash submission still waiting on staff.
create policy "Riders supersede waiting GCash submissions" on public.payments for update to authenticated
  using (
    provider = 'gcash' and status = 'processing' and public.auth_role() = 'rider'
    and exists (select 1 from public.orders o where o.id = order_id and o.rider_id = auth.uid())
  )
  with check (provider = 'gcash' and status = 'failed');

-- ---------------------------------------------------------------------------
-- Menu, branches, branding (super admin), sold out (branch admin)
-- ---------------------------------------------------------------------------

create policy "Super admins manage categories" on public.categories for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create policy "Super admins manage products" on public.products for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create policy "Super admins manage options" on public.product_variants for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create policy "Super admins read every branch" on public.branches for select to authenticated
  using (public.is_super_admin());

create policy "Super admins add branches" on public.branches for insert to authenticated
  with check (public.is_super_admin());

create policy "Super admins edit branches" on public.branches for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create policy "Branch admins mark products sold out" on public.branch_unavailable_products for insert to authenticated
  with check (public.is_branch_admin(branch_id));

create policy "Branch admins clear sold out" on public.branch_unavailable_products for delete to authenticated
  using (public.is_branch_admin(branch_id));

create policy "Super admins set site images" on public.site_images for insert to authenticated
  with check (public.is_super_admin());

create policy "Super admins change site images" on public.site_images for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

-- Only these columns, so nobody can change their own role or is_active.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone, default_address, updated_at) on public.profiles to authenticated;

create policy "Users update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- The delivery chat shows who you are talking to: just the name, only between the order's customer
-- and the rider holding it (a read policy would expose the whole row, phone and address included).
create or replace function public.chat_partner_name(p_profile uuid) returns text
  language sql stable security definer set search_path = ''
as $$
  select p.full_name from public.profiles p
  where p.id = p_profile
    and exists (
      select 1 from public.orders o
      where o.fulfillment_type = 'delivery'
        and ((o.customer_id = auth.uid() and o.rider_id = p_profile)
          or (o.rider_id = auth.uid() and o.customer_id = p_profile))
    )
$$;

revoke execute on function public.chat_partner_name(uuid) from public, anon;
grant execute on function public.chat_partner_name(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Chat (staff inbox and delivery chat; visitor chat runs on the server)
-- ---------------------------------------------------------------------------

create policy "Participants open a delivery thread" on public.chat_threads for insert to authenticated
  with check (
    kind = 'delivery' and exists (
      select 1 from public.orders o
      where o.id = order_id and o.branch_id = chat_threads.branch_id and o.fulfillment_type = 'delivery'
        and o.rider_id is not null and (o.customer_id = auth.uid() or o.rider_id = auth.uid())
    )
  );

create policy "Participants and staff update threads" on public.chat_threads for update to authenticated
  using (
    public.is_counter_staff(branch_id)
    or (kind = 'delivery' and exists (
      select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or o.rider_id = auth.uid())
    ))
  )
  with check (
    public.is_counter_staff(branch_id)
    or (kind = 'delivery' and exists (
      select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or o.rider_id = auth.uid())
    ))
  );

create policy "Staff, customers and riders send messages" on public.chat_messages for insert to authenticated
  with check (
    sender_id = auth.uid() and exists (
      select 1 from public.chat_threads t
      left join public.orders o on o.id = t.order_id
      where t.id = thread_id and (
        (t.kind = 'support' and sender_role = 'cashier' and public.is_counter_staff(t.branch_id))
        or (t.kind = 'delivery' and o.status = 'out_for_delivery' and o.rider_id is not null
            and ((sender_role = 'customer' and o.customer_id = auth.uid())
              or (sender_role = 'rider' and o.rider_id = auth.uid())))
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

create policy "Super admins upload menu images" on storage.objects for insert to authenticated
  with check (bucket_id = 'menu-images' and public.is_super_admin());

create policy "Super admins remove menu images" on storage.objects for delete to authenticated
  using (bucket_id = 'menu-images' and public.is_super_admin());

-- payment-receipts/<order_id>/<file>
create policy "Customers upload GCash receipts" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-receipts' and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1] and o.customer_id = auth.uid() and o.payment_method = 'gcash'
    )
  );

create policy "Customers and branch staff read receipts" on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-receipts' and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and (o.customer_id = auth.uid() or public.is_counter_staff(o.branch_id))
    )
  );

-- chat-images/<thread_id>/<file>: whoever can read the thread (chat_threads RLS applies here).
create policy "Thread members upload chat photos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-images'
    and exists (select 1 from public.chat_threads t where t.id::text = (storage.foldername(name))[1])
  );

create policy "Thread members read chat photos" on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-images'
    and exists (select 1 from public.chat_threads t where t.id::text = (storage.foldername(name))[1])
  );

create policy "Uploaders remove their own chat photos" on storage.objects for delete to authenticated
  using (bucket_id = 'chat-images' and owner_id = auth.uid()::text);
