import * as orderModel from '@/models/orderModel';
import * as paymentModel from '@/models/paymentModel';
import * as storageModel from '@/models/storageModel';
import { RECEIPT_BUCKET } from '@/models/storageModel';
import { ADMIN_ROLES } from '@/constants/orders';
import { canAccessBranch, getCaller } from '@/controllers/callerController';
import { getOrder, getScopedOrder, toCentavos, toPesos, type Order } from '@/controllers/orderController';
import { getGcashAccount } from '@/controllers/siteController';
import { signedUrlMap, uploadImage } from '@/controllers/storageController';
import { validate } from '@/utils/validate';
import { gcashProofSchema } from '@/utils/validators/order.validators';
import { cashPaymentSchema, counterGcashSchema, verifyGcashSchema, voidSchema } from '@/utils/validators/pos.validators';
import { fail, fromDbError, ok, type Result } from '@/utils/result';

/**
 * Manual GCash. There is no payment provider: the customer sends money to our GCash account
 * from their own phone, and staff confirm it against the GCash app.
 *
 *   online:  customer submits a reference number and/or receipt  -> processing
 *            staff approve -> paid, or reject -> failed (customer may resubmit)
 *   counter: the cashier records the reference from the customer's receipt -> paid
 *   void:    a paid GCash order goes to refund_pending; staff send the money back
 *            by hand and mark it refunded                       -> refunded
 *
 * Every state change claims the order with a conditional update on its current
 * payment_status, so a double-tap or two staff cannot both win.
 */

const SETTLED = ['paid', 'refund_pending', 'refunded'];
const MAX_RECEIPTS_PER_ORDER = 10;
const now = () => new Date().toISOString();

const payableProblem = (order: Order) => {
  if (SETTLED.includes(order.payment_status)) return fail(`Order payment is already ${order.payment_status}`, 409);
  if (['voided', 'cancelled'].includes(order.status)) return fail(`Cannot take payment on a ${order.status} order`, 409);
  return null;
};

/** Moves payment_status from one value to the next, or 409s if someone moved it first. */
const claim = async (orderId: string, fromStatus: string, changes: Record<string, unknown>) => {
  const { data, error } = await orderModel.updateOrderWhere(orderId, { payment_status: fromStatus }, changes);
  if (error) return fromDbError(error);
  if (!data) return fail('This order was just paid or changed; check it and retry', 409);
  return ok(data as Order);
};

const restore = (orderId: string, changes: Record<string, unknown>) => orderModel.updateOrderWhere(orderId, {}, changes);

/** A submission still waiting on staff must not be approved on top of a settled order. */
const supersedePendingGcash = (orderId: string, reason: string) =>
  paymentModel.updatePayments(orderId, { provider: 'gcash', status: 'processing' }, { status: 'failed', failure_reason: reason });

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The latest GCash submission for an order, with a temporary link to its receipt. */
export const latestGcashPayment = async (orderId: string) => {
  const { data } = await paymentModel.latestGcashPayment(orderId);
  if (!data) return null;
  const { receipt_path: path, ...payment } = data;
  const urls = await signedUrlMap(RECEIPT_BUCKET, [path]);
  return { ...payment, receipt_url: path ? (urls.get(path) ?? null) : null };
};

/** An order with `gcash_payment` attached, as the order screens show it. */
export const getOrderWithPayment = async (id: string): Promise<Result<Order>> => {
  const order = await getOrder(id);
  if (order.success === false) return order;
  const gcash_payment = order.data.payment_method === 'gcash' ? await latestGcashPayment(id) : null;
  return ok({ ...order.data, gcash_payment });
};

// ---------------------------------------------------------------------------
// Cash
// ---------------------------------------------------------------------------

/** Settles an order in cash and records who collected it. Returns the change owed. */
export const settleCashInternal = async (order: Order, tendered: number | null, collectedBy: string) => {
  const problem = payableProblem(order);
  if (problem) return problem;

  const total = toCentavos(order.total_amount);
  if (tendered != null && toCentavos(tendered) < total) {
    return fail(`Tendered amount ${tendered} is less than the total ${order.total_amount}`);
  }
  const change = tendered != null ? toPesos(toCentavos(tendered) - total) : null;

  const claimed = await claim(order.id, order.payment_status, { payment_status: 'paid', payment_method: 'cash' });
  if (claimed.success === false) return claimed;

  const { error } = await paymentModel.insertPayment({
    order_id: order.id,
    provider: 'cash',
    amount_centavos: total,
    status: 'paid',
    raw: { collected_by: collectedBy, tendered, change },
  });
  if (error) {
    // Do not leave an order marked paid with no payment behind it.
    await restore(order.id, { payment_status: order.payment_status, payment_method: order.payment_method });
    return fromDbError(error, 'Failed to record the payment');
  }
  return ok({ order: claimed.data, tendered, change });
};

export const payCash = async (orderId: string, input: unknown) => {
  const scoped = await getScopedOrder(orderId);
  if (scoped.success === false) return scoped;
  const body = validate(cashPaymentSchema, input);
  if (body.success === false) return body;

  const settled = await settleCashInternal(scoped.data.order, body.data.tendered_amount ?? null, scoped.data.caller.user.id);
  if (settled.success === false) return settled;
  await supersedePendingGcash(orderId, 'Replaced by a cash payment');
  return settled;
};

// ---------------------------------------------------------------------------
// GCash
// ---------------------------------------------------------------------------

const gcashOff = () => fail('GCash is not available right now; please pay in cash', 503);

const awaitingProofProblem = (order: Order) => {
  if (order.payment_method !== 'gcash') return fail('This order is not paid by GCash', 409);
  if (order.payment_status === 'processing') return fail('Your payment is already waiting to be verified', 409);
  return payableProblem(order);
};

/** Stores a receipt screenshot (private bucket) and returns its path, to send with the submission. */
export const uploadReceipt = async (orderId: string, file: Blob): Promise<Result<string>> => {
  if (!getGcashAccount()) return gcashOff();
  const order = await getOrder(orderId);
  if (order.success === false) return order;
  const problem = awaitingProofProblem(order.data);
  if (problem) return problem;

  const { data: existing } = await storageModel.list(RECEIPT_BUCKET, orderId, MAX_RECEIPTS_PER_ORDER);
  if ((existing?.length ?? 0) >= MAX_RECEIPTS_PER_ORDER) return fail('Too many receipts uploaded for this order', 409);
  return uploadImage(RECEIPT_BUCKET, orderId, file);
};

/** "I've paid": a reference number and/or receipt; the order waits for staff to check it. */
export const submitGcashProof = async (orderId: string, input: unknown): Promise<Result<Order>> => {
  if (!getGcashAccount()) return gcashOff();
  const body = validate(gcashProofSchema, input);
  if (body.success === false) return body;
  const order = await getOrder(orderId);
  if (order.success === false) return order;
  const problem = awaitingProofProblem(order.data);
  if (problem) return problem;

  const { reference_number: referenceNumber = null, receipt_path: receiptPath = null } = body.data;
  if (receiptPath && !receiptPath.startsWith(`${orderId}/`)) return fail('That receipt does not belong to this order');

  const claimed = await claim(orderId, order.data.payment_status, { payment_status: 'processing' });
  if (claimed.success === false) return claimed;

  const { error } = await paymentModel.insertPayment({
    order_id: orderId,
    provider: 'gcash',
    amount_centavos: toCentavos(order.data.total_amount),
    status: 'processing',
    reference_number: referenceNumber,
    receipt_path: receiptPath,
  });
  if (error) {
    await restore(orderId, { payment_status: order.data.payment_status });
    return fromDbError(error, 'Failed to submit the payment');
  }
  return getOrderWithPayment(orderId);
};

/** Staff approve (paid) or reject (failed, with a reason the customer sees). */
export const verifyGcash = async (orderId: string, input: unknown): Promise<Result<Order>> => {
  const scoped = await getScopedOrder(orderId);
  if (scoped.success === false) return scoped;
  const body = validate(verifyGcashSchema, input);
  if (body.success === false) return body;
  const { order, caller } = scoped.data;
  if (order.payment_status !== 'processing') return fail('No GCash payment is waiting for verification on this order', 409);

  const next = body.data.approve ? 'paid' : 'failed';
  const claimed = await claim(orderId, 'processing', { payment_status: next });
  if (claimed.success === false) return claimed;

  const { error } = await paymentModel.updatePayments(
    orderId,
    { provider: 'gcash', status: 'processing' },
    {
      status: next,
      failure_reason: body.data.approve ? null : (body.data.reason ?? null),
      verified_by: caller.user.id,
      verified_at: now(),
    },
  );
  if (error) {
    await restore(orderId, { payment_status: 'processing' });
    return fromDbError(error, 'Failed to update the payment');
  }
  return getOrderWithPayment(orderId);
};

/** The customer showed their GCash receipt at the counter; the cashier is the verifier. */
export const payGcashAtCounter = async (orderId: string, input: unknown): Promise<Result<Order>> => {
  if (!getGcashAccount()) return gcashOff();
  const scoped = await getScopedOrder(orderId);
  if (scoped.success === false) return scoped;
  const body = validate(counterGcashSchema, input);
  if (body.success === false) return body;
  const { order, caller } = scoped.data;
  const problem = payableProblem(order);
  if (problem) return problem;

  const claimed = await claim(orderId, order.payment_status, { payment_status: 'paid', payment_method: 'gcash' });
  if (claimed.success === false) return claimed;
  await supersedePendingGcash(orderId, 'Replaced by a payment at the counter');

  const { error } = await paymentModel.insertPayment({
    order_id: orderId,
    provider: 'gcash',
    amount_centavos: toCentavos(order.total_amount),
    status: 'paid',
    reference_number: body.data.reference_number,
    verified_by: caller.user.id,
    verified_at: now(),
    raw: { collected_by: caller.user.id },
  });
  if (error) {
    await restore(orderId, { payment_status: order.payment_status, payment_method: order.payment_method });
    return fromDbError(error, 'Failed to record the payment');
  }
  return getOrderWithPayment(orderId);
};

// ---------------------------------------------------------------------------
// Voids and refunds
// ---------------------------------------------------------------------------

/** Voids an order. A paid GCash order is flagged refund_pending first (the money goes back by hand). */
export const voidOrder = async (orderId: string, input: unknown): Promise<Result<{ order: Order; refund_pending: boolean }>> => {
  const scoped = await getScopedOrder(orderId);
  if (scoped.success === false) return scoped;
  const body = validate(voidSchema, input);
  if (body.success === false) return body;
  const { order, caller } = scoped.data;

  if (order.status === 'voided') return fail('Order is already voided', 409);
  if (order.status === 'completed') return fail('Cannot void a completed order', 409);
  if (order.payment_status === 'processing') {
    return fail('Verify or reject the GCash payment before voiding this order', 409);
  }

  const refundPending = order.payment_method === 'gcash' && order.payment_status === 'paid';
  if (refundPending) {
    const claimed = await claim(orderId, 'paid', { payment_status: 'refund_pending' });
    if (claimed.success === false) return claimed;
    const { error } = await paymentModel.updatePayments(orderId, { provider: 'gcash', status: 'paid' }, { status: 'refund_pending' });
    if (error) {
      await restore(orderId, { payment_status: 'paid' });
      return fromDbError(error);
    }
  }

  const { data, error } = await orderModel.updateOrderWhere(orderId, {}, {
    status: 'voided',
    void_reason: body.data.reason,
    voided_by: caller.user.id,
    voided_at: now(),
  });
  if (error) return fromDbError(error, 'Failed to void the order');
  return ok({ order: data, refund_pending: refundPending });
};

/** Admin: staff have sent the GCash money back. */
export const markRefunded = async (orderId: string): Promise<Result<Order>> => {
  const caller = await getCaller([...ADMIN_ROLES]);
  if (caller.success === false) return caller;
  const order = await getOrder(orderId);
  if (order.success === false) return order;
  if (!canAccessBranch(caller.data, order.data.branch_id)) return fail('Order not found', 404);
  if (order.data.payment_status !== 'refund_pending') return fail('No refund is pending for this order', 409);

  const claimed = await claim(orderId, 'refund_pending', { payment_status: 'refunded' });
  if (claimed.success === false) return claimed;

  const { data: rows } = await paymentModel.getPaymentsInStatus(orderId, 'refund_pending');
  for (const row of rows ?? []) {
    await paymentModel.updatePayment(row.id, {
      status: 'refunded',
      raw: { ...((row.raw as object) ?? {}), refunded_by: caller.data.user.id, refunded_at: now() },
    });
  }
  return getOrder(orderId);
};

export { supersedePendingGcash };
