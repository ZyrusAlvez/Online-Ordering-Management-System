import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError, fromPostgrestError } from '../utils/ApiError.js';
import { fetchOrder, toCentavos } from './order.service.js';

/**
 * PayMongo GCash, via the Payment Intent flow:
 *
 *   1. create a PaymentIntent for the order total
 *   2. create a `gcash` PaymentMethod
 *   3. attach the method to the intent -> PayMongo returns a redirect URL
 *   4. the customer authorises in GCash, PayMongo calls our webhook
 *
 * Nothing is ever marked paid from the redirect coming back — only from the
 * webhook. The redirect is a browser navigation the customer can forge or
 * simply never complete.
 */

const authHeader = () =>
  `Basic ${Buffer.from(`${env.PAYMONGO_SECRET_KEY}:`).toString('base64')}`;

const assertEnabled = () => {
  if (!env.paymongoEnabled) {
    throw new ApiError(503, 'GCash payments are not configured (PAYMONGO_SECRET_KEY is unset)');
  }
};

const paymongo = async (path, { method = 'POST', attributes } = {}) => {
  assertEnabled();

  // Named `response`, not `res`: this is a fetch Response, and a service must
  // never be reading an Express res.
  const response = await fetch(`${env.PAYMONGO_API_URL}${path}`, {
    method,
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    ...(attributes ? { body: JSON.stringify({ data: { attributes } }) } : {}),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = payload?.errors?.[0];
    // A 401 means OUR credentials are wrong — that is a 500 on our side, not a
    // bad gateway; anything else upstream is a 502.
    throw new ApiError(
      response.status === 401 ? 500 : 502,
      `PayMongo: ${detail?.detail ?? detail?.code ?? `request failed (${response.status})`}`,
      { provider_status: response.status, code: detail?.code },
    );
  }

  return payload.data;
};

/**
 * Starts a GCash charge for an order and returns the URL the customer must be
 * sent to. Safe to call again for a retry: a fresh intent is created and
 * recorded as another attempt.
 */
export const startGcashPayment = async (orderId, { returnUrl } = {}) => {
  assertEnabled();

  const order = await fetchOrder(orderId);
  if (!order) throw ApiError.notFound('Order not found');
  if (order.payment_status === 'paid') throw ApiError.conflict('Order is already paid');
  if (['voided', 'cancelled'].includes(order.status)) {
    throw ApiError.conflict(`Cannot take payment on a ${order.status} order`);
  }

  const amountCentavos = toCentavos(order.total_amount);
  // PayMongo rejects anything under PHP 20.00.
  if (amountCentavos < 2000) {
    throw ApiError.badRequest('GCash requires a minimum of PHP 20.00; please pay in cash');
  }

  const intent = await paymongo('/payment_intents', {
    attributes: {
      amount: amountCentavos,
      currency: 'PHP',
      payment_method_allowed: ['gcash'],
      description: `Order ${order.order_number}`,
      metadata: { order_id: order.id, order_number: order.order_number },
    },
  });

  const method = await paymongo('/payment_methods', {
    attributes: {
      type: 'gcash',
      billing: order.customer_name ? { name: order.customer_name } : undefined,
    },
  });

  const attached = await paymongo(`/payment_intents/${intent.id}/attach`, {
    attributes: {
      payment_method: method.id,
      return_url: returnUrl ?? `${env.PUBLIC_APP_URL}/payment-result?order=${order.id}`,
    },
  });

  const checkoutUrl = attached.attributes?.next_action?.redirect?.url ?? null;
  if (!checkoutUrl) {
    throw new ApiError(502, 'PayMongo did not return a GCash redirect URL');
  }

  const { error } = await supabaseAdmin.from('payments').insert({
    order_id: order.id,
    provider: 'paymongo',
    intent_id: intent.id,
    amount_centavos: amountCentavos,
    status: 'processing',
    raw: { client_key: attached.attributes?.client_key },
  });
  if (error) throw fromPostgrestError(error);

  const { error: orderError } = await supabaseAdmin
    .from('orders')
    .update({
      payment_status: 'processing',
      payment_method: 'gcash',
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.id);
  if (orderError) throw fromPostgrestError(orderError);

  return { intent_id: intent.id, checkout_url: checkoutUrl, amount: order.total_amount };
};

/**
 * Refunds a paid GCash order. PayMongo settles refunds asynchronously, so this
 * returns with the order in `refund_pending`; the refund.updated webhook moves
 * it to `refunded` or `refund_failed`.
 */
export const refundOrder = async (orderId, reason = 'others') => {
  assertEnabled();

  const { data: payment, error } = await supabaseAdmin
    .from('payments')
    .select('*')
    .eq('order_id', orderId)
    .eq('status', 'paid')
    .not('payment_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw fromPostgrestError(error);
  if (!payment) throw ApiError.conflict('No settled PayMongo payment found for this order');

  await supabaseAdmin
    .from('orders')
    .update({ payment_status: 'refund_pending', updated_at: new Date().toISOString() })
    .eq('id', orderId);

  try {
    const refund = await paymongo('/refunds', {
      attributes: {
        amount: payment.amount_centavos,
        payment_id: payment.payment_id,
        reason,
      },
    });

    await supabaseAdmin
      .from('payments')
      .update({
        refund_id: refund.id,
        status: 'refund_pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id);

    return refund;
  } catch (err) {
    // Surface the failure rather than leaving the order stuck in
    // refund_pending forever; an admin retries from /admin/orders/:id/refund.
    await supabaseAdmin
      .from('orders')
      .update({ payment_status: 'refund_failed', updated_at: new Date().toISOString() })
      .eq('id', orderId);
    await supabaseAdmin
      .from('payments')
      .update({
        status: 'refund_failed',
        failure_reason: err.message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id);

    throw err;
  }
};

/**
 * Verifies a PayMongo webhook signature.
 *
 * The header is `t=<unix ts>,te=<test sig>,li=<live sig>`; the signed payload
 * is `${t}.${rawBody}`, which is why the webhook route must receive the raw
 * bytes rather than a re-serialised JSON object.
 */
export const verifyWebhookSignature = (rawBody, signatureHeader, { toleranceSeconds = 300 } = {}) => {
  if (!env.PAYMONGO_WEBHOOK_SECRET) {
    throw new ApiError(503, 'PAYMONGO_WEBHOOK_SECRET is not configured');
  }
  if (!signatureHeader) throw ApiError.unauthorized('Missing PayMongo signature');

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((part) => part.split('=').map((s) => s.trim())),
  );

  const timestamp = parts.t;
  const presented = parts.li || parts.te;
  if (!timestamp || !presented) throw ApiError.unauthorized('Malformed PayMongo signature');

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) {
    throw ApiError.unauthorized('PayMongo signature timestamp is outside the allowed window');
  }

  const expected = createHmac('sha256', env.PAYMONGO_WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(presented, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw ApiError.unauthorized('PayMongo signature does not match');
  }

  return true;
};

/** Locates the order a webhook resource belongs to. */
const resolveOrderId = async (resource) => {
  const intentId = resource?.attributes?.payment_intent_id;
  const paymentId = resource?.id;
  const metadataOrderId = resource?.attributes?.metadata?.order_id;

  if (metadataOrderId) return metadataOrderId;

  for (const [column, value] of [
    ['intent_id', intentId],
    ['payment_id', paymentId],
    ['refund_id', paymentId],
  ]) {
    if (!value) continue;
    const { data } = await supabaseAdmin
      .from('payments')
      .select('order_id')
      .eq(column, value)
      .maybeSingle();
    if (data) return data.order_id;
  }

  return null;
};

/**
 * Applies one webhook event. Returns a short description of what it did, for
 * the log. Unknown event types are ignored rather than treated as errors —
 * PayMongo may send types we have not opted into.
 */
export const applyWebhookEvent = async (eventType, resource) => {
  const orderId = await resolveOrderId(resource);
  if (!orderId) return `ignored (${eventType}: no matching order)`;

  const now = new Date().toISOString();

  if (eventType === 'payment.paid') {
    const intentId = resource.attributes?.payment_intent_id;

    await supabaseAdmin
      .from('payments')
      .update({ payment_id: resource.id, status: 'paid', raw: resource, updated_at: now })
      .eq('order_id', orderId)
      .eq(intentId ? 'intent_id' : 'order_id', intentId ?? orderId);

    const order = await fetchOrder(orderId);

    await supabaseAdmin
      .from('orders')
      .update({
        payment_status: 'paid',
        payment_method: 'gcash',
        // A kiosk order that has paid for itself needs no cashier: send it
        // straight to the kitchen, which is the point of the kiosk.
        ...(order?.channel === 'kiosk' && order?.status === 'pending'
          ? { status: 'confirmed' }
          : {}),
        updated_at: now,
      })
      .eq('id', orderId);

    return `order ${orderId} marked paid`;
  }

  if (eventType === 'payment.failed') {
    await supabaseAdmin
      .from('payments')
      .update({
        status: 'failed',
        failure_reason: resource.attributes?.last_payment_error ?? 'Payment failed',
        raw: resource,
        updated_at: now,
      })
      .eq('order_id', orderId)
      .eq('status', 'processing');

    await supabaseAdmin
      .from('orders')
      .update({ payment_status: 'failed', updated_at: now })
      .eq('id', orderId);

    return `order ${orderId} payment failed`;
  }

  if (eventType === 'refund.updated') {
    const status = resource.attributes?.status;
    const settled = status === 'succeeded' ? 'refunded' : status === 'failed' ? 'refund_failed' : null;
    if (!settled) return `refund still pending for order ${orderId}`;

    await supabaseAdmin
      .from('payments')
      .update({ status: settled, raw: resource, updated_at: now })
      .eq('order_id', orderId)
      .eq('refund_id', resource.id);

    await supabaseAdmin
      .from('orders')
      .update({ payment_status: settled, updated_at: now })
      .eq('id', orderId);

    return `order ${orderId} ${settled}`;
  }

  return `ignored (${eventType})`;
};
