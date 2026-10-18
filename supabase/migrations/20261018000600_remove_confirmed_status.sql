-- The order flow is now New (pending) -> Preparing -> Ready -> Completed. 'confirmed' was an "accepted, not
-- cooking yet" step that nothing needed, and offering it next to "Send to kitchen" confused cashiers. It is removed:
-- existing confirmed orders go back to pending, the status check no longer allows it, and the rules that named it
-- now say pending. Also: kiosk and walk-in (pos) orders must be paid before they go to the kitchen.

-- 1. Existing orders
update public.orders set status = 'pending' where status = 'confirmed';

-- 2. The allowed statuses
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled', 'voided'));

-- 3. Staff edit items only while the order is new and unpaid
drop policy "Counter staff edit items before payment" on public.order_items;
create policy "Counter staff edit items before payment" on public.order_items for all to authenticated
  using (exists (select 1 from public.orders o
                 where o.id = order_items.order_id and public.is_counter_staff(o.branch_id)
                   and o.status = 'pending' and o.payment_status in ('unpaid', 'failed')))
  with check (exists (select 1 from public.orders o
                      where o.id = order_items.order_id and public.is_counter_staff(o.branch_id)
                        and o.status = 'pending' and o.payment_status in ('unpaid', 'failed')));

-- 4. guard_order: customers cancel only while new; staff cannot start an unpaid kiosk or walk-in order
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

  if new.id <> old.id or new.branch_id <> old.branch_id or new.channel <> old.channel
     or new.customer_id is distinct from old.customer_id or new.kiosk_device_id is distinct from old.kiosk_device_id
     or new.order_number is distinct from old.order_number or new.created_at <> old.created_at then
    raise exception 'That part of an order cannot be changed' using errcode = '42501';
  end if;
  new.total_amount := public.order_items_total(new.id);

  if public.is_counter_staff(old.branch_id) then
    -- Kiosk and walk-in orders are paid at the counter before the kitchen starts them.
    if new.status = 'preparing' and old.status <> 'preparing' and old.channel in ('kiosk', 'pos')
       and new.payment_status <> 'paid' then
      raise exception 'Take payment first' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if v_role = 'rider' and public.is_active_user() then
    v_free := array['rider_id', 'status', 'claimed_at', 'delivered_at', 'payment_status', 'payment_method', 'updated_at', 'total_amount'];
    v_changed := (to_jsonb(new) - v_free) <> (to_jsonb(old) - v_free);
    if v_changed or old.fulfillment_type <> 'delivery' then
      raise exception 'Riders can only claim, return and deliver orders' using errcode = '42501';
    end if;
    if (old.status = 'ready' and old.rider_id is null and new.status = 'out_for_delivery' and new.rider_id = v_uid)
       or (old.rider_id = v_uid and old.status = 'out_for_delivery' and new.status = 'ready' and new.rider_id is null)
       or (old.rider_id = v_uid and old.status = 'out_for_delivery' and new.rider_id = v_uid
           and new.status in ('out_for_delivery', 'completed')
           and (new.payment_status = old.payment_status
                or (new.payment_status = 'paid' and new.payment_method = 'cash'
                    and old.payment_status not in ('paid', 'refund_pending', 'refunded')))) then
      return new;
    end if;
    raise exception 'That delivery change is not allowed' using errcode = '42501';
  end if;

  if old.customer_id = v_uid then
    v_free := array['status', 'payment_status', 'updated_at', 'total_amount'];
    v_changed := (to_jsonb(new) - v_free) <> (to_jsonb(old) - v_free);
    if not v_changed then
      if new.status = 'cancelled' and old.status = 'pending'
         and old.payment_status in ('unpaid', 'failed') and new.payment_status = old.payment_status then
        return new;
      end if;
      if new.status = old.status and old.payment_method = 'gcash' and old.status not in ('voided', 'cancelled')
         and old.payment_status in ('unpaid', 'failed') and new.payment_status = 'processing' then
        return new;
      end if;
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
