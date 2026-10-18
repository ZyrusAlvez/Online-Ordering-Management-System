import { supabase } from '@/utils/supabase';
import { WITH_ITEMS } from '@/constants/orders';

export type OrderFilters = {
  page?: number;
  limit?: number;
  status?: string;
  paymentStatus?: string;
  channel?: string;
  search?: string;
  createdAfter?: string;
  createdBefore?: string;
  branchIds?: string[] | null;
  customerId?: string;
};

/** PostgREST `or()` pattern with the value quoted, so commas and parentheses in a search cannot break the filter. */
const containsAny = (columns: string[], text: string) => {
  const escaped = text.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/"/g, '\\"');
  return columns.map((c) => `${c}.ilike."%${escaped}%"`).join(',');
};

export const listOrders = ({
  page = 1,
  limit = 20,
  status,
  paymentStatus,
  channel,
  search,
  createdAfter,
  createdBefore,
  branchIds = null,
  customerId,
}: OrderFilters) => {
  const from = (page - 1) * limit;
  let query = supabase
    .from('orders')
    .select(WITH_ITEMS, { count: 'exact' })
    .order('created_at', { ascending: false })
    // Two orders can share a timestamp; `id` keeps paging deterministic.
    .order('id')
    .range(from, from + limit - 1);

  if (branchIds) query = query.in('branch_id', branchIds);
  if (customerId) query = query.eq('customer_id', customerId);
  if (status) query = query.eq('status', status);
  if (paymentStatus) query = query.eq('payment_status', paymentStatus);
  if (channel) query = query.eq('channel', channel);
  if (createdAfter) query = query.gte('created_at', createdAfter);
  if (createdBefore) query = query.lte('created_at', createdBefore);
  if (search) query = query.or(containsAny(['order_number', 'customer_name'], search));
  return query;
};

export const getOrder = (id: string) => supabase.from('orders').select(WITH_ITEMS).eq('id', id).maybeSingle();

export const insertOrder = (fields: Record<string, unknown>) => supabase.from('orders').insert(fields).select('id').single();

export const deleteOrder = (id: string) => supabase.from('orders').delete().eq('id', id);

export const insertOrderItems = (rows: Record<string, unknown>[]) => supabase.from('order_items').insert(rows);

export const deleteOrderItems = (orderId: string) => supabase.from('order_items').delete().eq('order_id', orderId);

/**
 * Conditional update: `where` must still match when the row is written, so two people acting
 * at once cannot both win (the loser gets no row back). Returns the order with its items.
 */
export const updateOrderWhere = (id: string, where: Record<string, unknown>, changes: Record<string, unknown>) => {
  let query = supabase
    .from('orders')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id);
  for (const [column, value] of Object.entries(where)) {
    if (Array.isArray(value)) query = query.in(column, value);
    else if (value === null) query = query.is(column, null);
    else query = query.eq(column, value as string);
  }
  return query.select(WITH_ITEMS).maybeSingle();
};

/** Live prices for the products in a cart. */
export const getProductsForPricing = (ids: string[]) =>
  supabase.from('products').select('id, name, price, is_available, product_variants(id, price)').in('id', ids);

export const getSoldOutAmong = (branchId: string, productIds: string[]) =>
  supabase.from('branch_unavailable_products').select('product_id').eq('branch_id', branchId).in('product_id', productIds);

// Rider pool and deliveries (RLS limits riders to their branches' pool and their own orders).
export const listPool = (branchIds: string[]) =>
  supabase
    .from('orders')
    .select(WITH_ITEMS)
    .in('branch_id', branchIds)
    .eq('status', 'ready')
    .eq('fulfillment_type', 'delivery')
    .is('rider_id', null)
    .order('created_at')
    .order('id');

export const listRiderOrders = (riderId: string, active: boolean, page = 1, limit = 20) => {
  const from = (page - 1) * limit;
  let query = supabase
    .from('orders')
    .select(WITH_ITEMS, { count: 'exact' })
    .eq('rider_id', riderId)
    .order('created_at', { ascending: false })
    .order('id')
    .range(from, from + limit - 1);
  query = active ? query.eq('status', 'out_for_delivery') : query.in('status', ['completed', 'voided', 'cancelled']);
  return query;
};
