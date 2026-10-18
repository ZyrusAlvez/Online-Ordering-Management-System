-- Fix: the order guard summed order_items as the caller, and RLS hides an order's items from a
-- rider until they hold it, so claiming an order reset its total to 0. Sum as the owner instead.

create or replace function public.order_items_total(p_order uuid) returns numeric
  language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(i.unit_price * i.quantity), 0) from public.order_items i where i.order_id = p_order
$$;

-- The guard runs as the caller, so the caller needs to be able to call this. It only reveals the
-- total of an order whose (random) id you already have.
revoke execute on function public.order_items_total(uuid) from public, anon;
grant execute on function public.order_items_total(uuid) to authenticated;

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
                    and old.payment_status not in ('paid', 'refund_pending', 'refunded', 'refund_failed')))) then
      return new;
    end if;
    raise exception 'That delivery change is not allowed' using errcode = '42501';
  end if;

  if old.customer_id = v_uid then
    v_free := array['status', 'payment_status', 'updated_at', 'total_amount'];
    v_changed := (to_jsonb(new) - v_free) <> (to_jsonb(old) - v_free);
    if not v_changed then
      if new.status = 'cancelled' and old.status in ('pending', 'confirmed')
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
