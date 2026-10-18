import * as orderModel from '@/models/orderModel';
import { getCaller } from '@/controllers/callerController';
import { getOrder, type Order, type Page } from '@/controllers/orderController';
import { settleCashInternal, supersedePendingGcash } from '@/controllers/paymentController';
import { validate } from '@/utils/validate';
import { deliveredSchema, riderOrdersQuery } from '@/utils/validators/rider.validators';
import { fail, fromDbError, ok, type Result } from '@/utils/result';

/**
 * Riders take from a shared pool of ready delivery orders at their branch rather than being
 * dispatched, so the queue self-balances.
 */
export const getPool = async (): Promise<Result<Order[]>> => {
  const caller = await getCaller(['rider']);
  if (caller.success === false) return caller;
  const ids = caller.data.branchIds ?? [];
  if (!ids.length) return ok([]);
  const { data, error } = await orderModel.listPool(ids);
  if (error) return fromDbError(error, 'Failed to load the pool');
  return ok(data ?? []);
};

export const getMyDeliveries = async (query: Record<string, unknown> = {}): Promise<Result<Page<Order>>> => {
  const caller = await getCaller(['rider']);
  if (caller.success === false) return caller;
  const q = validate(riderOrdersQuery, query);
  if (q.success === false) return q;
  const { data, error, count } = await orderModel.listRiderOrders(
    caller.data.user.id,
    q.data.active === 'true',
    q.data.page,
    q.data.limit,
  );
  if (error) return fromDbError(error, 'Failed to load deliveries');
  const total = count ?? 0;
  return ok({ data: data ?? [], meta: { page: q.data.page, limit: q.data.limit, total, pages: Math.max(1, Math.ceil(total / q.data.limit)) } });
};

/**
 * Claim an order. The race is settled by the conditional update: two riders claiming at once
 * send the same statement, but `rider_id is null` matches for only one of them.
 */
export const claimOrder = async (orderId: string): Promise<Result<Order>> => {
  const caller = await getCaller(['rider']);
  if (caller.success === false) return caller;
  const ids = caller.data.branchIds ?? [];
  const { data, error } = await orderModel.updateOrderWhere(
    orderId,
    { branch_id: ids, status: 'ready', fulfillment_type: 'delivery', rider_id: null },
    { rider_id: caller.data.user.id, status: 'out_for_delivery', claimed_at: new Date().toISOString() },
  );
  if (error) return fromDbError(error);
  if (!data) return fail('Order is no longer available to claim', 409);
  return ok(data);
};

export const unclaimOrder = async (orderId: string): Promise<Result<Order>> => {
  const caller = await getCaller(['rider']);
  if (caller.success === false) return caller;
  const { data, error } = await orderModel.updateOrderWhere(
    orderId,
    { rider_id: caller.data.user.id, status: 'out_for_delivery' },
    { rider_id: null, status: 'ready', claimed_at: null },
  );
  if (error) return fromDbError(error);
  if (!data) return fail('Order is not currently claimed by you', 409);
  return ok(data);
};

/** Complete a delivery. For cash on delivery, the collected amount settles the payment too. */
export const markDelivered = async (orderId: string, input: unknown): Promise<Result<Order>> => {
  const caller = await getCaller(['rider']);
  if (caller.success === false) return caller;
  const body = validate(deliveredSchema, input);
  if (body.success === false) return body;
  const riderId = caller.data.user.id;

  const order = await getOrder(orderId);
  if (order.success === false) return order;
  if (order.data.rider_id !== riderId) return fail('This delivery is not assigned to you', 403);
  if (order.data.status !== 'out_for_delivery') return fail(`Cannot deliver an order that is ${order.data.status}`, 409);

  if (order.data.payment_status !== 'paid') {
    const collected = body.data.collected_amount;
    if (collected == null) return fail('collected_amount is required for a cash-on-delivery order');
    const settled = await settleCashInternal(order.data, collected, riderId);
    if (settled.success === false) return settled;
    await supersedePendingGcash(orderId, 'Replaced by cash on delivery');
  }

  const { data, error } = await orderModel.updateOrderWhere(
    orderId,
    { rider_id: riderId, status: 'out_for_delivery' },
    { status: 'completed', delivered_at: new Date().toISOString() },
  );
  if (error) return fromDbError(error);
  if (!data) return fail('Order changed while being updated; retry', 409);
  return ok(data);
};
