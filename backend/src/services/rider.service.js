import { supabaseAdmin } from '../config/supabase.js';
import { WITH_ITEMS } from '../constants/orders.js';
import { ApiError, fromPostgrestError } from '../utils/ApiError.js';
import { applyRange } from '../utils/pagination.js';
import { getOrderOrFail, settleCash } from './order.service.js';

const now = () => new Date().toISOString();

/**
 * Unclaimed delivery orders the kitchen has finished. Riders take from this
 * shared pool rather than being dispatched, so the queue self-balances and
 * does not stall when nobody is watching a dispatcher screen.
 */
export const listPool = async () => {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select(WITH_ITEMS)
    .eq('status', 'ready')
    .eq('fulfillment_type', 'delivery')
    .is('rider_id', null)
    .order('created_at')
    .order('id');

  if (error) throw fromPostgrestError(error);
  return data;
};

export const listRiderOrders = async (riderId, { page, limit, active }) => {
  let query = applyRange(
    supabaseAdmin
      .from('orders')
      .select(WITH_ITEMS, { count: 'exact' })
      .eq('rider_id', riderId)
      .order('created_at', { ascending: false })
      .order('id'),
    { page, limit },
  );

  query =
    active === 'true'
      ? query.eq('status', 'out_for_delivery')
      : query.in('status', ['completed', 'voided', 'cancelled']);

  const { data, error, count } = await query;
  if (error) throw fromPostgrestError(error);

  return { data, total: count ?? 0 };
};

/**
 * Claim an order from the pool.
 *
 * The whole race is settled by this conditional update: two riders claiming at
 * once issue the same statement, but `rider_id is null` matches for only one
 * of them. The loser updates zero rows and gets a 409 — no read-then-write, no
 * transaction, no lock.
 */
export const claimOrder = async (orderId, riderId) => {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .update({
      rider_id: riderId,
      status: 'out_for_delivery',
      claimed_at: now(),
      updated_at: now(),
    })
    .eq('id', orderId)
    .eq('status', 'ready')
    .eq('fulfillment_type', 'delivery')
    .is('rider_id', null)
    .select(WITH_ITEMS)
    .maybeSingle();

  if (error) throw fromPostgrestError(error);
  if (!data) throw ApiError.conflict('Order is no longer available to claim');

  return data;
};

export const unclaimOrder = async (orderId, riderId) => {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .update({ rider_id: null, status: 'ready', claimed_at: null, updated_at: now() })
    .eq('id', orderId)
    .eq('rider_id', riderId)
    .eq('status', 'out_for_delivery')
    .select(WITH_ITEMS)
    .maybeSingle();

  if (error) throw fromPostgrestError(error);
  if (!data) throw ApiError.conflict('Order is not currently claimed by you');

  return data;
};

/**
 * Complete a delivery. For a cash order this is also where the money is
 * collected, so `collectedAmount` settles the payment at the same time.
 */
export const markDelivered = async (orderId, riderId, { collectedAmount = null } = {}) => {
  const order = await getOrderOrFail(orderId);

  if (order.rider_id !== riderId) {
    throw ApiError.forbidden('This delivery is not assigned to you');
  }
  if (order.status !== 'out_for_delivery') {
    throw ApiError.conflict(`Cannot deliver an order that is ${order.status}`);
  }

  const isCod = order.payment_status !== 'paid';
  if (isCod && collectedAmount == null) {
    throw ApiError.badRequest('collected_amount is required for a cash-on-delivery order');
  }

  // settleCash validates the amount covers the total and records the payment.
  if (isCod) {
    await settleCash(orderId, { tenderedAmount: collectedAmount, collectedBy: riderId });
  }

  const { data, error } = await supabaseAdmin
    .from('orders')
    .update({ status: 'completed', delivered_at: now(), updated_at: now() })
    .eq('id', orderId)
    .eq('rider_id', riderId)
    .eq('status', 'out_for_delivery')
    .select(WITH_ITEMS)
    .maybeSingle();

  if (error) throw fromPostgrestError(error);
  if (!data) throw ApiError.conflict('Order changed while being updated; retry');

  return data;
};
