import * as orderService from '../services/order.service.js';
import * as paymentService from '../services/payment.service.js';
import { branchFilter, resolveBranch } from '../utils/branchScope.js';
import { buildMeta } from '../utils/pagination.js';

/**
 * The cashier's working queue. This is how a kiosk order is "fetched" at the
 * counter: the customer quotes their name or order number, the cashier
 * searches, settles payment and sends it to the kitchen.
 */
export const listQueue = async (req, res) => {
  const { page, limit, status, payment_status: paymentStatus, channel, q } = req.query;
  const { data, total } = await orderService.listOrders({
    branchIds: branchFilter(req.branchScope, req.query.branch_id),
    page,
    limit,
    status,
    paymentStatus,
    channel,
    search: q,
  });

  res.json({ data, meta: buildMeta({ page, limit, total }) });
};

// requireOrderInScope has already loaded the order and checked its branch.
export const getOrder = async (req, res) => {
  res.json({ data: await paymentService.withGcashPayment(req.order) });
};

/** A walk-in order rung up directly at the counter. */
export const createWalkIn = async (req, res) => {
  const data = await orderService.createOrder({
    branchId: resolveBranch(req.branchScope, req.body.branch_id),
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
    collectedBy: req.user.id,
  });
  // A GCash submission still waiting on staff must not be approved on top of this.
  await paymentService.supersedePendingGcash(req.params.id, 'Replaced by a cash payment');

  res.json({ data: order, meta: { tendered, change } });
};

/** The customer showed their GCash receipt at the counter; record its reference number. */
export const payGcash = async (req, res) => {
  const data = await paymentService.settleGcashAtCounter(req.params.id, {
    referenceNumber: req.body.reference_number,
    collectedBy: req.user.id,
  });
  res.json({ data });
};

/** Approve or reject an online customer's GCash reference number / receipt. */
export const verifyGcash = async (req, res) => {
  const data = await paymentService.verifyGcash(req.params.id, {
    approve: req.body.approve,
    reason: req.body.reason ?? null,
    verifiedBy: req.user.id,
  });
  res.json({ data });
};

/**
 * Void an order. Unlike a customer cancel this works after the kitchen has
 * started, and it records who did it and why.
 *
 * A paid GCash order is moved to refund_pending as part of the void: staff send
 * the money back from the GCash account by hand, then mark it refunded.
 */
export const voidOrder = async (req, res) => {
  const { order } = req;
  orderService.assertVoidable(order);

  const refundPending = order.payment_status === 'paid' && order.payment_method === 'gcash';
  if (refundPending) await paymentService.markRefundPending(order.id);

  const data = await orderService.voidOrder(req.params.id, {
    reason: req.body.reason,
    voidedBy: req.user.id,
  });

  res.json({ data, meta: { refund_pending: refundPending } });
};
