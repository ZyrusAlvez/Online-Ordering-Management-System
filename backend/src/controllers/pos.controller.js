import * as orderService from '../services/order.service.js';
import * as paymentService from '../services/payment.service.js';
import { buildMeta } from '../utils/pagination.js';

/**
 * The cashier's working queue. This is how a kiosk order is "fetched" at the
 * counter: the customer quotes their name or order number, the cashier
 * searches, settles payment and sends it to the kitchen.
 */
export const listQueue = async (req, res) => {
  const { page, limit, status, payment_status: paymentStatus, channel, q } = req.query;
  const { data, total } = await orderService.listOrders({
    page,
    limit,
    status,
    paymentStatus,
    channel,
    search: q,
  });

  res.json({ data, meta: buildMeta({ page, limit, total }) });
};

export const getOrder = async (req, res) => {
  res.json({ data: await orderService.getOrderOrFail(req.params.id) });
};

/** A walk-in order rung up directly at the counter. */
export const createWalkIn = async (req, res) => {
  const data = await orderService.createOrder({
    items: req.body.items,
    channel: 'pos',
    fulfillmentType: req.body.fulfillment_type,
    customerName: req.body.customer_name,
    paymentMethod: req.body.payment_method,
    notes: req.body.notes ?? null,
  });

  res.status(201).json({ data });
};

/** Replace the order's items — the "modify a kiosk order" action. */
export const replaceItems = async (req, res) => {
  res.json({ data: await orderService.replaceOrderItems(req.params.id, req.body.items) });
};

export const confirm = async (req, res) => {
  res.json({ data: await orderService.confirmOrder(req.params.id) });
};

export const advanceStatus = async (req, res) => {
  res.json({ data: await orderService.advanceStatus(req.params.id, req.body.status) });
};

/** Settle in cash at the counter; `meta.change` is what the drawer owes back. */
export const payCash = async (req, res) => {
  const { order, tendered, change } = await orderService.settleCash(req.params.id, {
    tenderedAmount: req.body.tendered_amount ?? null,
  });

  res.json({ data: order, meta: { tendered, change } });
};

export const payGcash = async (req, res) => {
  res.json({ data: await paymentService.startGcashPayment(req.params.id) });
};

/**
 * Void an order. Unlike a customer cancel this works after the kitchen has
 * started, and it records who did it and why.
 *
 * A paid GCash order is refunded as part of the void. If PayMongo rejects the
 * refund the order is left in refund_failed for an admin to retry, rather than
 * being voided with the customer's money kept.
 */
export const voidOrder = async (req, res) => {
  const order = await orderService.getOrderOrFail(req.params.id);
  orderService.assertVoidable(order);

  const refund =
    order.payment_status === 'paid' && order.payment_method === 'gcash'
      ? await paymentService.refundOrder(req.params.id, 'others')
      : null;

  const data = await orderService.voidOrder(req.params.id, {
    reason: req.body.reason,
    voidedBy: req.user.id,
  });

  res.json({ data, meta: { refund_id: refund?.id ?? null } });
};
