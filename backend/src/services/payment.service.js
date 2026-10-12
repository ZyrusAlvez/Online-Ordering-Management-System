import { env } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError, fromPostgrestError } from '../utils/ApiError.js';
import { fetchOrder, getOrderOrFail, toCentavos } from './order.service.js';
import { signedUrls, uploadPrivateImage } from './storage.service.js';

/**
 * Manual GCash. There is no payment provider: the customer sends money to our
 * GCash account from their own phone, and staff confirm it against the GCash app.
 *
 *   online:  customer submits a reference number and/or receipt  -> processing
 *            staff approve -> paid, or reject -> failed (customer may resubmit)
 *   counter: the customer shows their receipt (POS walk-in, or a kiosk order)
 *            and the cashier records the reference number         -> paid
 *   void:    a paid GCash order goes to refund_pending; staff send the money
 *            back by hand and mark it refunded                     -> refunded
 *
 * One payments row per submission, so a rejected-then-resubmitted payment keeps
 * its history. Every state change claims the order with a conditional update
 * on its current payment_status, so a double-tap or two staff cannot both win.
 */

// Receipt screenshots carry names and numbers, so they live in a private bucket
// and are only ever shown through short-lived signed links.
export const RECEIPT_BUCKET = 'payment-receipts';
const RECEIPT_LINK_SECONDS = 3600;
// Bounds what one order can store, since a customer could upload without submitting.
const MAX_RECEIPTS_PER_ORDER = 10;

// Money has already changed hands (or is on its way back).
const SETTLED = ['paid', 'refund_pending', 'refunded', 'refund_failed'];

const now = () => new Date().toISOString();

/** The account customers pay into, or null when GCash is switched off. */
export const getGcashAccount = () => env.gcash;

export const assertGcashEnabled = () => {
  if (!env.gcash) throw new ApiError(503, 'GCash is not available right now; please pay in cash');
};

const assertPayable = (order) => {
  if (SETTLED.includes(order.payment_status)) {
    throw ApiError.conflict(`Order payment is already ${order.payment_status}`);
  }
  if (['voided', 'cancelled'].includes(order.status)) {
    throw ApiError.conflict(`Cannot take payment on a ${order.status} order`);
  }
};

/** Moves an order from one payment_status to the next, or 409s if it moved first. */
const claimOrder = async (orderId, fromStatus, changes) => {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .update({ ...changes, updated_at: now() })
    .eq('id', orderId)
    .eq('payment_status', fromStatus)
    .select('id')
    .maybeSingle();

  if (error) throw fromPostgrestError(error);
  if (!data) throw ApiError.conflict('This order was just paid or changed; check it and retry');
};

const restoreOrder = (orderId, paymentStatus) =>
  supabaseAdmin.from('orders').update({ payment_status: paymentStatus, updated_at: now() }).eq('id', orderId);

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The latest GCash submission for an order, with a temporary link to its receipt. */
export const latestGcashPayment = async (orderId) => {
  const { data, error } = await supabaseAdmin
    .from('payments')
    .select('id, status, reference_number, receipt_path, failure_reason, created_at, verified_at')
    .eq('order_id', orderId)
    .eq('provider', 'gcash')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw fromPostgrestError(error);
  if (!data) return null;

  const { receipt_path: path, ...payment } = data;
  const urls = await signedUrls(RECEIPT_BUCKET, [path], RECEIPT_LINK_SECONDS);
  return { ...payment, receipt_url: path ? (urls.get(path) ?? null) : null };
};

/** Adds `gcash_payment` (the latest submission, or null) to an order. */
export const withGcashPayment = async (order) => ({
  ...order,
  gcash_payment: order.payment_method === 'gcash' ? await latestGcashPayment(order.id) : null,
});

// ---------------------------------------------------------------------------
// Online: the customer proves they paid
// ---------------------------------------------------------------------------

const assertAwaitingProof = (order) => {
  if (order.payment_method !== 'gcash') throw ApiError.conflict('This order is not paid by GCash');
  if (order.payment_status === 'processing') {
    throw ApiError.conflict('Your payment is already waiting to be verified');
  }
  assertPayable(order);
};

/** Stores a receipt screenshot for an order and returns its path, to send with the submission. */
export const uploadGcashReceipt = async (orderId, body) => {
  assertGcashEnabled();
  assertAwaitingProof(await getOrderOrFail(orderId));

  const { data: existing } = await supabaseAdmin.storage
    .from(RECEIPT_BUCKET)
    .list(orderId, { limit: MAX_RECEIPTS_PER_ORDER });
  if ((existing?.length ?? 0) >= MAX_RECEIPTS_PER_ORDER) {
    throw ApiError.conflict('Too many receipts uploaded for this order');
  }

  return uploadPrivateImage(RECEIPT_BUCKET, orderId, body);
};

/** Records a reference number and/or receipt and puts the order up for staff verification. */
export const submitGcashProof = async (orderId, { referenceNumber = null, receiptPath = null }) => {
  assertGcashEnabled();
  const order = await getOrderOrFail(orderId);
  assertAwaitingProof(order);

  // The path came back from our own upload, but the client carried it: make sure
  // it points at this order's receipts and not someone else's.
  if (receiptPath && !receiptPath.startsWith(`${orderId}/`)) {
    throw ApiError.badRequest('That receipt does not belong to this order');
  }

  await claimOrder(orderId, order.payment_status, { payment_status: 'processing' });

  const { error } = await supabaseAdmin.from('payments').insert({
    order_id: orderId,
    provider: 'gcash',
    amount_centavos: toCentavos(order.total_amount),
    status: 'processing',
    reference_number: referenceNumber,
    receipt_path: receiptPath,
  });
  if (error) {
    await restoreOrder(orderId, order.payment_status);
    throw fromPostgrestError(error);
  }

  return withGcashPayment(await fetchOrder(orderId));
};

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

/** Approve (paid) or reject (failed, with a reason the customer sees) a submission. */
export const verifyGcash = async (orderId, { approve, reason = null, verifiedBy }) => {
  const order = await getOrderOrFail(orderId);
  if (order.payment_status !== 'processing') {
    throw ApiError.conflict('No GCash payment is waiting for verification on this order');
  }

  const next = approve ? 'paid' : 'failed';
  await claimOrder(orderId, 'processing', { payment_status: next });

  const { error } = await supabaseAdmin
    .from('payments')
    .update({
      status: next,
      failure_reason: approve ? null : reason,
      verified_by: verifiedBy,
      verified_at: now(),
      updated_at: now(),
    })
    .eq('order_id', orderId)
    .eq('provider', 'gcash')
    .eq('status', 'processing');
  if (error) {
    await restoreOrder(orderId, 'processing');
    throw fromPostgrestError(error);
  }

  return withGcashPayment(await fetchOrder(orderId));
};

/**
 * Marks any submission still waiting on staff as failed. Used when the order is
 * settled another way (cash, or GCash shown at the counter), so the old
 * submission cannot be approved on top of it.
 */
export const supersedePendingGcash = async (orderId, reason) => {
  const { error } = await supabaseAdmin
    .from('payments')
    .update({ status: 'failed', failure_reason: reason, updated_at: now() })
    .eq('order_id', orderId)
    .eq('provider', 'gcash')
    .eq('status', 'processing');
  if (error) throw fromPostgrestError(error);
};

/**
 * The customer showed their GCash receipt at the counter (a walk-in, or a kiosk
 * order paid on the customer's phone). The cashier is the verifier here.
 */
export const settleGcashAtCounter = async (orderId, { referenceNumber, collectedBy }) => {
  assertGcashEnabled();
  const order = await getOrderOrFail(orderId);
  assertPayable(order);

  await claimOrder(orderId, order.payment_status, { payment_status: 'paid', payment_method: 'gcash' });
  await supersedePendingGcash(orderId, 'Replaced by a payment at the counter');

  const { error } = await supabaseAdmin.from('payments').insert({
    order_id: orderId,
    provider: 'gcash',
    amount_centavos: toCentavos(order.total_amount),
    status: 'paid',
    reference_number: referenceNumber,
    verified_by: collectedBy,
    verified_at: now(),
    raw: { collected_by: collectedBy },
  });
  if (error) {
    // Do not leave an order marked paid with no payment behind it.
    await supabaseAdmin
      .from('orders')
      .update({ payment_status: order.payment_status, payment_method: order.payment_method, updated_at: now() })
      .eq('id', orderId);
    throw fromPostgrestError(error);
  }

  return withGcashPayment(await fetchOrder(orderId));
};

// ---------------------------------------------------------------------------
// Refunds (sent by hand)
// ---------------------------------------------------------------------------

/** A paid GCash order is being voided: the customer is owed their money back. */
export const markRefundPending = async (orderId) => {
  await claimOrder(orderId, 'paid', { payment_status: 'refund_pending' });

  const { error } = await supabaseAdmin
    .from('payments')
    .update({ status: 'refund_pending', updated_at: now() })
    .eq('order_id', orderId)
    .eq('provider', 'gcash')
    .eq('status', 'paid');
  if (error) {
    await restoreOrder(orderId, 'paid');
    throw fromPostgrestError(error);
  }
};

/** Staff have sent the money back from the GCash account. */
export const markRefunded = async (orderId, { refundedBy }) => {
  const order = await getOrderOrFail(orderId);
  if (order.payment_status !== 'refund_pending') {
    throw ApiError.conflict('No refund is pending for this order');
  }

  await claimOrder(orderId, 'refund_pending', { payment_status: 'refunded' });

  const { data: rows, error } = await supabaseAdmin
    .from('payments')
    .select('id, raw')
    .eq('order_id', orderId)
    .eq('status', 'refund_pending');
  if (error) throw fromPostgrestError(error);

  for (const row of rows) {
    await supabaseAdmin
      .from('payments')
      .update({
        status: 'refunded',
        raw: { ...(row.raw ?? {}), refunded_by: refundedBy, refunded_at: now() },
        updated_at: now(),
      })
      .eq('id', row.id);
  }

  return fetchOrder(orderId);
};
