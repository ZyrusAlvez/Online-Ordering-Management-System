import * as orderModel from '@/models/orderModel';
import * as branchModel from '@/models/branchModel';
import { z } from 'zod';
import { ALLOWED_TRANSITIONS, COUNTER_ROLES, ORDER_STATUSES } from '@/constants/orders';
import { canAccessBranch, getCaller } from '@/controllers/callerController';
import { getGcashAccount } from '@/controllers/siteController';
import { shapeBranch } from '@/controllers/branchController';
import { orderTimeProblem } from '@/utils/schedule';
import { validate } from '@/utils/validate';
import { createOnlineOrderSchema, myOrdersQuery } from '@/utils/validators/order.validators';
import { createWalkInOrderSchema, posQueueQuery, replaceItemsSchema } from '@/utils/validators/pos.validators';
import { adminOrderQuery } from '@/utils/validators/admin.validators';
import { fail, fromDbError, ok, type Result } from '@/utils/result';

export type Order = Record<string, any>;
export type Page<T> = { data: T[]; meta: { page: number; limit: number; total: number; pages: number } };
type Line = { product_id: string; variant_id?: string; quantity: number; notes?: string };

/** Money as integer centavos: prices come back as numeric strings, and float sums drift. */
export const toCentavos = (amount: number | string) => Math.round(Number(amount) * 100);
export const toPesos = (centavos: number) => Number((centavos / 100).toFixed(2));

const page = <T>(data: T[], total: number, p: number, limit: number): Page<T> => ({
  data,
  meta: { page: p, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
});

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getOrder = async (id: string): Promise<Result<Order>> => {
  const { data, error } = await orderModel.getOrder(id);
  if (error) return fromDbError(error, 'Failed to load the order');
  // RLS hides other people's (and other branches') orders, so "not found" either way.
  if (!data) return fail('Order not found', 404);
  return ok(data);
};

export const listMyOrders = async (query: Record<string, unknown> = {}): Promise<Result<Page<Order>>> => {
  const caller = await getCaller();
  if (caller.success === false) return caller;
  const q = validate(myOrdersQuery, query);
  if (q.success === false) return q;
  const { data, error, count } = await orderModel.listOrders({ ...q.data, customerId: caller.data.user.id });
  if (error) return fromDbError(error, 'Failed to load orders');
  return ok(page(data ?? [], count ?? 0, q.data.page, q.data.limit));
};

/** The POS queue and the admin list: the caller's branches, optionally one of them. */
export const listStaffOrders = async (query: Record<string, unknown> = {}): Promise<Result<Page<Order>>> => {
  const caller = await getCaller([...COUNTER_ROLES]);
  if (caller.success === false) return caller;
  // The POS queue searches by `q`; the admin list narrows by `from`/`to`.
  const q = validate(
    posQueueQuery.merge(adminOrderQuery).extend({
      // The POS queue asks for all of a tab's statuses in one request (up to 100 of each).
      statuses: z.array(z.enum(ORDER_STATUSES)).min(1).max(ORDER_STATUSES.length).optional(),
      limit: z.coerce.number().int().min(1).max(100 * ORDER_STATUSES.length).default(20),
    }),
    query,
  );
  if (q.success === false) return q;
  const { branch_id: branchId, payment_status: paymentStatus, q: search, from, to, ...rest } = q.data as any;

  let branchIds = caller.data.branchIds;
  if (branchId) {
    if (!canAccessBranch(caller.data, branchId)) return ok(page([], 0, rest.page, rest.limit));
    branchIds = [branchId];
  }
  // An admin with no branches assigned sees nothing, not everything.
  if (branchIds && branchIds.length === 0) return ok(page([], 0, rest.page, rest.limit));

  const { data, error, count } = await orderModel.listOrders({
    ...rest,
    paymentStatus,
    search,
    createdAfter: from,
    createdBefore: to,
    branchIds,
  });
  if (error) return fromDbError(error, 'Failed to load orders');
  return ok(page(data ?? [], count ?? 0, rest.page, rest.limit));
};

// ---------------------------------------------------------------------------
// Pricing and creation
// ---------------------------------------------------------------------------

/**
 * Resolves cart lines against live menu prices; only ids and quantities come from the cart.
 * Fails if anything is unknown, unavailable (everywhere or at this branch) or unpriced.
 * The database re-prices on insert as well (the price_order_item trigger), so a tampered
 * browser cannot change what an order costs.
 */
export const priceOrder = async (items: Line[], branchId: string) => {
  const ids = [...new Set(items.map((i) => i.product_id))];
  const [{ data: products, error }, { data: soldOutRows }] = await Promise.all([
    orderModel.getProductsForPricing(ids),
    orderModel.getSoldOutAmong(branchId, ids),
  ]);
  if (error) return fromDbError(error, 'Failed to price the order');
  return priceFromRows(items, products ?? [], (soldOutRows ?? []).map((r) => r.product_id));
};

/** The pricing rules on already-loaded rows; shared with the kiosk, which prices on the server. */
export const priceFromRows = (items: Line[], products: any[], soldOutIds: string[]) => {
  const byId = new Map(products.map((p: any) => [p.id, p]));
  const soldOut = new Set(soldOutIds);

  const lines = [];
  for (const item of items) {
    const product: any = byId.get(item.product_id);
    if (!product) return fail(`Unknown product: ${item.product_id}`);
    if (product.is_available === false) return fail(`Product is unavailable: ${product.name}`, 409);
    if (soldOut.has(product.id)) return fail(`Sold out at this branch: ${product.name}`, 409);

    let unitPrice = product.price;
    if (item.variant_id) {
      const variant = product.product_variants.find((v: any) => v.id === item.variant_id);
      if (!variant) return fail(`Variant ${item.variant_id} does not belong to product ${item.product_id}`);
      unitPrice = variant.price;
    }
    if (unitPrice == null) return fail(`Price not yet set for product: ${product.name}`, 409);

    lines.push({
      product_id: item.product_id,
      variant_id: item.variant_id ?? null,
      quantity: item.quantity,
      unit_price: unitPrice,
      notes: item.notes ?? null,
    });
  }
  const totalCentavos = lines.reduce((sum, l) => sum + toCentavos(l.unit_price) * l.quantity, 0);
  return ok({ lines, totalCentavos });
};

/** Shared by POS and online. `order_number` is assigned by a database trigger. */
const insertOrder = async (fields: Record<string, unknown>, items: Line[]): Promise<Result<Order>> => {
  if (fields.payment_method === 'gcash' && !getGcashAccount()) {
    return fail('GCash is not available right now; please pay in cash');
  }
  const priced = await priceOrder(items, fields.branch_id as string);
  if (priced.success === false) return priced;

  const { data: order, error } = await orderModel.insertOrder({
    ...fields,
    payment_status: 'unpaid',
    status: 'pending',
    total_amount: toPesos(priced.data.totalCentavos),
  });
  if (error) return fromDbError(error, 'Failed to place the order');

  const { error: itemsError } = await orderModel.insertOrderItems(
    priced.data.lines.map((line) => ({ ...line, order_id: order.id })),
  );
  if (itemsError) {
    // Roll back the header so a failed insert cannot leave an empty order.
    await orderModel.deleteOrder(order.id);
    return fromDbError(itemsError, 'Failed to place the order');
  }
  return getOrder(order.id);
};

/** Customer checkout: delivery or pickup from one branch, now or scheduled. */
export const placeOnlineOrder = async (input: unknown): Promise<Result<Order>> => {
  const caller = await getCaller();
  if (caller.success === false) return caller;
  const body = validate(createOnlineOrderSchema, input);
  if (body.success === false) return body;
  const b = body.data;

  const { data: branchRow } = await branchModel.getBranchById(b.branch_id);
  if (!branchRow || !branchRow.is_active) return fail('That branch is not taking orders');
  const timing = orderTimeProblem(shapeBranch(branchRow), b.scheduled_for ?? null);
  if (timing) return fail(timing.message, timing.status);

  const user = caller.data.user;
  return insertOrder(
    {
      branch_id: b.branch_id,
      channel: 'online',
      fulfillment_type: b.fulfillment_type,
      customer_id: user.id,
      customer_name: user.user_metadata?.full_name ?? null,
      customer_phone: b.customer_phone ?? null,
      payment_method: b.payment_method,
      delivery_address: b.delivery_address ?? null,
      notes: b.notes ?? null,
      scheduled_for: b.scheduled_for ?? null,
    },
    b.items as Line[],
  );
};

/** Walk-in order at the counter. */
export const createWalkInOrder = async (input: unknown): Promise<Result<Order>> => {
  const caller = await getCaller([...COUNTER_ROLES]);
  if (caller.success === false) return caller;
  const body = validate(createWalkInOrderSchema, input);
  if (body.success === false) return body;
  const b: any = body.data;

  // One branch: use it. Several (or a super admin): the screen must say which.
  let branchId = b.branch_id;
  if (!branchId) {
    const ids = caller.data.branchIds;
    if (ids && ids.length === 1) branchId = ids[0];
    else return fail('Choose a branch');
  }
  if (!canAccessBranch(caller.data, branchId)) return fail('Branch not found', 404);

  return insertOrder(
    {
      branch_id: branchId,
      channel: 'pos',
      fulfillment_type: b.fulfillment_type,
      customer_name: b.customer_name ?? null,
      payment_method: b.payment_method ?? null,
      notes: b.notes ?? null,
    },
    b.items,
  );
};

// ---------------------------------------------------------------------------
// Counter actions on an existing order (branch-scoped)
// ---------------------------------------------------------------------------

/** Loads an order the counter caller may act on; 404 for another branch's order. */
export const getScopedOrder = async (id: string) => {
  const caller = await getCaller([...COUNTER_ROLES]);
  if (caller.success === false) return caller;
  const order = await getOrder(id);
  if (order.success === false) return order;
  if (!canAccessBranch(caller.data, order.data.branch_id)) return fail('Order not found', 404);
  return ok({ caller: caller.data, order: order.data });
};

/** POS "modify order": only before the kitchen commits and before any money moves. */
export const replaceItems = async (id: string, input: unknown): Promise<Result<Order>> => {
  const scoped = await getScopedOrder(id);
  if (scoped.success === false) return scoped;
  const body = validate(replaceItemsSchema, input);
  if (body.success === false) return body;
  const { order } = scoped.data;

  if (order.status !== 'pending') return fail(`Cannot modify an order that is ${order.status}`, 409);
  // A GCash receipt for PHP 100 on an order edited up to PHP 500 would be approved as paid in full.
  if (!['unpaid', 'failed'].includes(order.payment_status)) {
    return fail(`Cannot modify an order whose payment is ${order.payment_status}`, 409);
  }

  const priced = await priceOrder((body.data as any).items, order.branch_id);
  if (priced.success === false) return priced;

  const previous = (order.order_items ?? []).map((l: any) => ({
    order_id: id,
    product_id: l.product_id,
    variant_id: l.variant_id,
    quantity: l.quantity,
    unit_price: l.unit_price,
    notes: l.notes,
  }));

  const { error: deleteError } = await orderModel.deleteOrderItems(id);
  if (deleteError) return fromDbError(deleteError);
  const { error: insertError } = await orderModel.insertOrderItems(priced.data.lines.map((l) => ({ ...l, order_id: id })));
  if (insertError) {
    if (previous.length) await orderModel.insertOrderItems(previous);
    return fromDbError(insertError, 'Failed to update the items');
  }

  const { data, error } = await orderModel.updateOrderWhere(id, {}, { total_amount: toPesos(priced.data.totalCentavos) });
  if (error) return fromDbError(error);
  return ok(data);
};

/** Kiosk and walk-in orders are paid at the counter before the kitchen starts them. */
export const mustPayFirst = (order: Order) => ['kiosk', 'pos'].includes(order.channel) && order.payment_status !== 'paid';

/** Moves an order along the pipeline (new -> preparing -> ready -> completed), rejecting skipped steps. */
export const advanceStatus = async (id: string, next: string): Promise<Result<Order>> => {
  const scoped = await getScopedOrder(id);
  if (scoped.success === false) return scoped;
  const { order } = scoped.data;

  const allowed: readonly string[] = ALLOWED_TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(next)) {
    return fail(
      `Cannot move an order from ${order.status} to ${next}` + (allowed.length ? ` (allowed: ${allowed.join(', ')})` : ''),
      409,
    );
  }
  if (next === 'preparing' && mustPayFirst(order)) return fail('Take payment first', 409);
  const { data, error } = await orderModel.updateOrderWhere(id, { status: order.status }, { status: next });
  if (error) return fromDbError(error);
  if (!data) return fail('Order changed while being updated; retry', 409);
  return ok(data);
};

/** Customer cancel: only while unstarted and unpaid (a rejected GCash payment counts as unpaid). */
export const cancelMyOrder = async (id: string): Promise<Result<Order>> => {
  const caller = await getCaller();
  if (caller.success === false) return caller;
  const { data, error } = await orderModel.updateOrderWhere(
    id,
    { customer_id: caller.data.user.id, status: 'pending', payment_status: ['unpaid', 'failed'] },
    { status: 'cancelled' },
  );
  if (error) return fromDbError(error);
  if (!data) return fail('Order not found, already paid, or can no longer be cancelled', 409);
  return ok(data);
};
