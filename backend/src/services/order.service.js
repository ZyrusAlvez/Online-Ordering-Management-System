import { supabaseAdmin } from '../config/supabase.js';
import { ALLOWED_TRANSITIONS, WITH_ITEMS } from '../constants/orders.js';
import { ApiError, fromPostgrestError } from '../utils/ApiError.js';
import { canAccessBranch } from '../utils/branchScope.js';
import { soldOutAt } from './branch.service.js';
import { applyRange } from '../utils/pagination.js';
import { anyColumnContains } from '../utils/postgrest.js';

export { WITH_ITEMS };

/**
 * Money is handled as integer centavos throughout this module. Prices come
 * back from Postgres as numeric strings, and multiplying those as floats
 * accumulates rounding error; PayMongo also bills in centavos, so this is the
 * representation needed at that boundary anyway.
 */
export const toCentavos = (amount) => Math.round(Number(amount) * 100);
export const toPesos = (centavos) => Number((centavos / 100).toFixed(2));

const now = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Re-reads an order with its items joined, in the shape every route returns. */
export const fetchOrder = async (orderId, client = supabaseAdmin) => {
  const { data, error } = await client
    .from('orders')
    .select(WITH_ITEMS)
    .eq('id', orderId)
    .maybeSingle();

  if (error) throw fromPostgrestError(error);
  return data;
};

/** fetchOrder, but raises 404 instead of returning null. */
export const getOrderOrFail = async (orderId, client = supabaseAdmin) => {
  const order = await fetchOrder(orderId, client);
  if (!order) throw ApiError.notFound('Order not found');
  return order;
};

/**
 * fetchOrder for staff: 404 unless the order belongs to a branch in `scope`, so
 * a cashier or branch admin cannot act on (or even confirm) another branch's order.
 */
export const getScopedOrderOrFail = async (orderId, scope) => {
  const order = await fetchOrder(orderId);
  if (!order || !canAccessBranch(scope, order.branch_id)) throw ApiError.notFound('Order not found');
  return order;
};

/**
 * Lists orders with the filters every caller needs. `client` decides the
 * visibility: pass a caller-scoped client to let RLS narrow rows to that user,
 * or the default admin client for staff views that must see everything.
 */
export const listOrders = async ({
  client = supabaseAdmin,
  page,
  limit,
  status,
  paymentStatus,
  channel,
  search,
  createdAfter,
  createdBefore,
  branchIds = null,
} = {}) => {
  // An admin with no branches assigned sees nothing, not everything.
  if (branchIds && branchIds.length === 0) return { data: [], total: 0 };

  let query = applyRange(
    client
      .from('orders')
      .select(WITH_ITEMS, { count: 'exact' })
      .order('created_at', { ascending: false })
      // Two orders can share a timestamp; `id` keeps paging deterministic.
      .order('id'),
    { page, limit },
  );

  if (branchIds) query = query.in('branch_id', branchIds);
  if (status) query = query.eq('status', status);
  if (paymentStatus) query = query.eq('payment_status', paymentStatus);
  if (channel) query = query.eq('channel', channel);
  if (createdAfter) query = query.gte('created_at', createdAfter);
  if (createdBefore) query = query.lte('created_at', createdBefore);
  if (search) {
    query = query.or(anyColumnContains(['order_number', 'customer_name'], search));
  }

  const { data, error, count } = await query;
  if (error) throw fromPostgrestError(error);

  return { data, total: count ?? 0 };
};

// ---------------------------------------------------------------------------
// Pricing and creation
// ---------------------------------------------------------------------------

/**
 * Resolves cart lines against live menu prices. A client-supplied total is
 * never trusted — only product/variant ids and quantities come from the
 * request. Throws if anything is unknown, unavailable (everywhere, or sold out
 * at `branchId`), or unpriced.
 */
export const priceOrder = async (items, branchId = null) => {
  const ids = items.map((item) => item.product_id);
  const [{ data: products, error }, soldOut] = await Promise.all([
    supabaseAdmin.from('products').select('id, name, price, is_available, product_variants(id, price)').in('id', ids),
    soldOutAt(branchId, ids),
  ]);

  if (error) throw fromPostgrestError(error);

  const byId = new Map(products.map((product) => [product.id, product]));

  const lines = items.map((item) => {
    const product = byId.get(item.product_id);
    if (!product) throw ApiError.badRequest(`Unknown product: ${item.product_id}`);
    if (product.is_available === false) {
      throw ApiError.conflict(`Product is unavailable: ${product.name}`);
    }
    if (soldOut.has(product.id)) {
      throw ApiError.conflict(`Sold out at this branch: ${product.name}`);
    }

    let unitPrice = product.price;
    if (item.variant_id) {
      const variant = product.product_variants.find((v) => v.id === item.variant_id);
      if (!variant) {
        throw ApiError.badRequest(
          `Variant ${item.variant_id} does not belong to product ${item.product_id}`,
        );
      }
      unitPrice = variant.price;
    }

    if (unitPrice == null) {
      throw ApiError.conflict(`Price not yet set for product: ${product.name}`);
    }

    return {
      product_id: item.product_id,
      variant_id: item.variant_id ?? null,
      quantity: item.quantity,
      unit_price: unitPrice,
      notes: item.notes ?? null,
    };
  });

  const totalCentavos = lines.reduce(
    (sum, line) => sum + toCentavos(line.unit_price) * line.quantity,
    0,
  );

  return { lines, totalCentavos };
};

/**
 * Creates an order and its items. Shared by the kiosk, POS and online routers
 * so pricing and rollback behave identically on every channel.
 *
 * `order_number` is assigned by the orders_set_order_number trigger.
 */
export const createOrder = async ({
  branchId,
  items,
  channel,
  fulfillmentType,
  customerId = null,
  customerName = null,
  customerPhone = null,
  paymentMethod = null,
  kioskDeviceId = null,
  deliveryAddress = null,
  notes = null,
}) => {
  const { lines, totalCentavos } = await priceOrder(items, branchId);

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert({
      branch_id: branchId,
      customer_id: customerId,
      customer_name: customerName,
      customer_phone: customerPhone,
      channel,
      fulfillment_type: fulfillmentType,
      payment_method: paymentMethod,
      payment_status: 'unpaid',
      status: 'pending',
      total_amount: toPesos(totalCentavos),
      kiosk_device_id: kioskDeviceId,
      delivery_address: deliveryAddress,
      notes,
    })
    .select()
    .single();

  if (orderError) throw fromPostgrestError(orderError);

  const { error: itemsError } = await supabaseAdmin
    .from('order_items')
    .insert(lines.map((line) => ({ ...line, order_id: order.id })));

  if (itemsError) {
    // Roll back the header so a failed insert cannot leave an empty order.
    await supabaseAdmin.from('orders').delete().eq('id', order.id);
    throw fromPostgrestError(itemsError);
  }

  return fetchOrder(order.id);
};

/**
 * Hard-deletes an order. Only for rolling back an order the caller never
 * successfully received — a real order that must go away is `voided`, which
 * keeps the audit trail.
 */
export const discardOrder = async (orderId) => {
  const { error } = await supabaseAdmin.from('orders').delete().eq('id', orderId);
  if (error) throw fromPostgrestError(error);
};

/**
 * Replaces an order's items and recomputes its total — the POS "modify order"
 * action. Only valid before the kitchen has committed to the order.
 */
export const replaceOrderItems = async (orderId, items) => {
  const order = await getOrderOrFail(orderId);
  if (!['pending', 'confirmed'].includes(order.status)) {
    throw ApiError.conflict(`Cannot modify an order that is ${order.status}`);
  }
  // Once money is moving the total is fixed: a GCash intent for PHP 100 on an
  // order edited up to PHP 500 would mark it paid in full.
  if (!['unpaid', 'failed'].includes(order.payment_status)) {
    throw ApiError.conflict(`Cannot modify an order whose payment is ${order.payment_status}`);
  }

  const { lines, totalCentavos } = await priceOrder(items, order.branch_id);

  // Remember the current lines so a failed insert can put them back instead of
  // leaving an order with no items and a stale total.
  const previous = (order.order_items ?? []).map((line) => ({
    order_id: orderId,
    product_id: line.product_id,
    variant_id: line.variant_id,
    quantity: line.quantity,
    unit_price: line.unit_price,
    notes: line.notes,
  }));

  const { error: deleteError } = await supabaseAdmin
    .from('order_items')
    .delete()
    .eq('order_id', orderId);
  if (deleteError) throw fromPostgrestError(deleteError);

  const { error: insertError } = await supabaseAdmin
    .from('order_items')
    .insert(lines.map((line) => ({ ...line, order_id: orderId })));
  if (insertError) {
    if (previous.length) await supabaseAdmin.from('order_items').insert(previous);
    throw fromPostgrestError(insertError);
  }

  const { error: updateError } = await supabaseAdmin
    .from('orders')
    .update({ total_amount: toPesos(totalCentavos), updated_at: now() })
    .eq('id', orderId);
  if (updateError) throw fromPostgrestError(updateError);

  return fetchOrder(orderId);
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** pending -> confirmed. Conditional so a double-confirm is a 409, not a no-op. */
export const confirmOrder = async (orderId) => {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .update({ status: 'confirmed', updated_at: now() })
    .eq('id', orderId)
    .eq('status', 'pending')
    .select(WITH_ITEMS)
    .maybeSingle();

  if (error) throw fromPostgrestError(error);
  if (!data) throw ApiError.conflict('Order not found or is no longer pending');

  return data;
};

/** Moves an order along the pipeline, rejecting transitions that skip stages. */
export const advanceStatus = async (orderId, nextStatus) => {
  const order = await getOrderOrFail(orderId);

  const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(nextStatus)) {
    throw ApiError.conflict(
      `Cannot move an order from ${order.status} to ${nextStatus}` +
        (allowed.length ? ` (allowed: ${allowed.join(', ')})` : ''),
    );
  }

  const { data, error } = await supabaseAdmin
    .from('orders')
    .update({ status: nextStatus, updated_at: now() })
    .eq('id', orderId)
    .eq('status', order.status) // lost-update guard
    .select(WITH_ITEMS)
    .maybeSingle();

  if (error) throw fromPostgrestError(error);
  if (!data) throw ApiError.conflict('Order changed while being updated; retry');

  return data;
};

/**
 * Customer-initiated cancel. Ownership is checked here (`customer_id`), since
 * customers have no write access to orders at all: it only applies while the
 * order is unstarted and not paid. Cancelling a paid order is a void, which
 * carries a refund. A failed GCash attempt counts as unpaid.
 */
export const cancelOwnOrder = async (orderId, customerId) => {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .update({ status: 'cancelled', updated_at: now() })
    .eq('id', orderId)
    .eq('customer_id', customerId)
    .in('status', ['pending', 'confirmed'])
    .in('payment_status', ['unpaid', 'failed'])
    .select(WITH_ITEMS)
    .maybeSingle();

  if (error) throw fromPostgrestError(error);
  if (!data) {
    throw ApiError.conflict('Order not found, already paid, or can no longer be cancelled');
  }

  return data;
};

/**
 * Guards the void preconditions, separately from performing the void, because
 * a paid GCash order must be refunded *between* the two — and a failed refund
 * must leave the order un-voided rather than voided with the money kept.
 */
export const assertVoidable = (order) => {
  if (order.status === 'voided') throw ApiError.conflict('Order is already voided');
  if (order.status === 'completed') throw ApiError.conflict('Cannot void a completed order');
};

/** Marks an order voided with an audit trail. Refunds are handled by the caller. */
export const voidOrder = async (orderId, { reason, voidedBy }) => {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .update({
      status: 'voided',
      void_reason: reason,
      voided_by: voidedBy,
      voided_at: now(),
      updated_at: now(),
    })
    .eq('id', orderId)
    .select(WITH_ITEMS)
    .maybeSingle();

  if (error) throw fromPostgrestError(error);
  if (!data) throw ApiError.notFound('Order not found');

  return data;
};

// ---------------------------------------------------------------------------
// Cash settlement
// ---------------------------------------------------------------------------

/**
 * Settles an order in cash and records the payment. Returns the change owed so
 * the POS can pop it on screen for the cashier.
 */
export const settleCash = async (orderId, { tenderedAmount = null, collectedBy = null } = {}) => {
  const order = await getOrderOrFail(orderId);

  if (['paid', 'refund_pending', 'refunded', 'refund_failed'].includes(order.payment_status)) {
    throw ApiError.conflict(`Order payment is already ${order.payment_status}`);
  }
  if (['voided', 'cancelled'].includes(order.status)) {
    throw ApiError.conflict(`Cannot take payment on a ${order.status} order`);
  }

  const totalCentavos = toCentavos(order.total_amount);

  if (tenderedAmount != null && toCentavos(tenderedAmount) < totalCentavos) {
    throw ApiError.badRequest(
      `Tendered amount ${tenderedAmount} is less than the total ${order.total_amount}`,
    );
  }

  // Claim the payment with a conditional update, so two simultaneous requests
  // (a double-tap, two cashiers) cannot both succeed.
  const { data, error } = await supabaseAdmin
    .from('orders')
    .update({ payment_status: 'paid', payment_method: 'cash', updated_at: now() })
    .eq('id', orderId)
    .eq('payment_status', order.payment_status)
    .select(WITH_ITEMS)
    .maybeSingle();

  if (error) throw fromPostgrestError(error);
  if (!data) throw ApiError.conflict('This order was just paid or changed; check it and retry');

  const { error: paymentError } = await supabaseAdmin.from('payments').insert({
    order_id: orderId,
    provider: 'cash',
    amount_centavos: totalCentavos,
    status: 'paid',
    // Who took the money and how much was handed over, for the end-of-day count.
    raw: {
      collected_by: collectedBy,
      tendered: tenderedAmount,
      change: tenderedAmount != null ? toPesos(toCentavos(tenderedAmount) - totalCentavos) : null,
    },
  });
  if (paymentError) {
    // Do not leave an order marked paid with no payment behind it.
    await supabaseAdmin
      .from('orders')
      .update({ payment_status: order.payment_status, updated_at: now() })
      .eq('id', orderId);
    throw fromPostgrestError(paymentError);
  }

  return {
    order: data,
    tendered: tenderedAmount,
    change: tenderedAmount != null ? toPesos(toCentavos(tenderedAmount) - totalCentavos) : null,
  };
};
