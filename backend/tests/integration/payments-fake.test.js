import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';
import { db } from '../helpers/db.js';
import { allProducts, branchId } from '../helpers/fixtures.js';

/**
 * Payment-provider behaviour that cannot be reached through the API here
 * (PayMongo is not configured in the test environment), exercised in-process
 * against a fake PayMongo server that records every call it receives.
 *
 * The services read their settings when first imported, so the fake's address is
 * put into the environment BEFORE they are imported (hence the dynamic imports).
 */

const state = { calls: [], cancelFails: false, intentStatus: 'awaiting_next_action', refundFails: false, seq: 0 };

const fake = createServer((req, res) => {
  const path = req.url.replace(/^\/v1/, '');
  state.calls.push(`${req.method} ${path}`);
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  req.resume();
  req.on('end', () => {
    state.seq += 1;
    if (req.method === 'POST' && path === '/payment_intents') return send(200, { data: { id: `pi_fake_${state.seq}`, attributes: {} } });
    if (req.method === 'POST' && path === '/payment_methods') return send(200, { data: { id: `pm_fake_${state.seq}` } });
    if (/\/attach$/.test(path)) {
      return send(200, { data: { attributes: { client_key: 'ck', next_action: { redirect: { url: 'https://pay.example/go' } } } } });
    }
    if (/\/cancel$/.test(path)) {
      return state.cancelFails ? send(400, { errors: [{ detail: 'cannot cancel' }] }) : send(200, { data: { id: 'x' } });
    }
    if (req.method === 'GET' && /^\/payment_intents\//.test(path)) {
      return send(200, { data: { id: 'x', attributes: { status: state.intentStatus } } });
    }
    if (req.method === 'POST' && path === '/refunds') {
      return state.refundFails ? send(400, { errors: [{ detail: 'refund rejected' }] }) : send(200, { data: { id: `rf_fake_${state.seq}` } });
    }
    return send(404, { errors: [{ detail: `unexpected ${req.method} ${path}` }] });
  });
});
await new Promise((resolve) => fake.listen(0, '127.0.0.1', resolve));

process.env.PAYMONGO_SECRET_KEY = 'sk_test_fake';
process.env.PAYMONGO_API_URL = `http://127.0.0.1:${fake.address().port}/v1`;

const payments = await import('../../src/services/payment.service.js');
const orders = await import('../../src/services/order.service.js');
const pos = await import('../../src/controllers/pos.controller.js');

const created = [];
let product;

before(async () => {
  // GCash refuses charges under PHP 20, so use a dish that costs more.
  product = (await allProducts()).find((p) => p.price != null && Number(p.price) >= 100 && p.variants.length === 0);
  assert.ok(product, 'need a flat-priced product of PHP 100 or more');
});

after(async () => {
  if (created.length) await db.from('orders').delete().in('id', created);
  await new Promise((resolve) => fake.close(resolve));
});

beforeEach(() => {
  state.calls = [];
  state.cancelFails = false;
  state.intentStatus = 'awaiting_next_action';
  state.refundFails = false;
});

const newOrder = async (fields = {}) => {
  const order = await orders.createOrder({
    branchId: await branchId(),
    items: [{ product_id: product.id, quantity: 1 }],
    channel: 'pos',
    fulfillmentType: 'take_out',
    customerName: 'Fake Pay',
  });
  created.push(order.id);
  if (Object.keys(fields).length) await db.from('orders').update(fields).eq('id', order.id);
  return order;
};

const paymentRows = async (orderId) =>
  (await db.from('payments').select('*').eq('order_id', orderId).order('created_at')).data;

const addPayment = (orderId, fields) =>
  db.from('payments').insert({ order_id: orderId, provider: 'paymongo', amount_centavos: 10000, ...fields });

const respond = () => {
  const res = { statusCode: 200 };
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (body) => ((res.body = body), res);
  return res;
};

describe('starting GCash again', () => {
  it('cancels the earlier attempt so the customer cannot be charged twice', async () => {
    const order = await newOrder();
    await payments.startGcashPayment(order.id);
    await payments.startGcashPayment(order.id);

    assert.ok(state.calls.some((c) => /\/payment_intents\/pi_fake_\d+\/cancel$/.test(c)), 'old intent cancelled');
    const rows = await paymentRows(order.id);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].status, 'failed');
    assert.equal(rows[1].status, 'processing');
  });

  it('refuses to replace an attempt that PayMongo says is already going through', async () => {
    const order = await newOrder();
    await payments.startGcashPayment(order.id);

    state.cancelFails = true;
    state.intentStatus = 'succeeded';
    await assert.rejects(() => payments.startGcashPayment(order.id), (err) => err.status === 409);

    const rows = await paymentRows(order.id);
    assert.equal(rows.length, 1, 'no second charge was created');
    assert.equal(rows[0].status, 'processing', 'the live attempt is left alone');
  });

  it('moves on when the old attempt cannot be cancelled because it already expired', async () => {
    const order = await newOrder();
    await payments.startGcashPayment(order.id);

    state.cancelFails = true;
    state.intentStatus = 'awaiting_payment_method';
    await payments.startGcashPayment(order.id);

    assert.equal((await paymentRows(order.id)).length, 2);
  });
});

describe('refunds', () => {
  it('retries a refund that failed earlier (it used to answer 409 forever)', async () => {
    const order = await newOrder({ payment_status: 'refund_failed', payment_method: 'gcash' });
    await addPayment(order.id, { intent_id: 'pi_old', payment_id: 'pay_old', status: 'refund_failed' });

    const refund = await payments.refundOrder(order.id);

    assert.ok(refund.id);
    assert.ok(state.calls.includes('POST /refunds'));
    assert.equal((await paymentRows(order.id))[0].status, 'refund_pending');
    assert.equal((await orders.fetchOrder(order.id)).payment_status, 'refund_pending');
  });

  it('leaves the order as refund_failed when PayMongo rejects it again', async () => {
    const order = await newOrder({ payment_status: 'paid', payment_method: 'gcash' });
    await addPayment(order.id, { intent_id: 'pi_x', payment_id: 'pay_x', status: 'paid' });

    state.refundFails = true;
    await assert.rejects(() => payments.refundOrder(order.id), (err) => err.status === 502);
    assert.equal((await orders.fetchOrder(order.id)).payment_status, 'refund_failed');
  });
});

describe('voiding a GCash order', () => {
  // The real route loads the order into req.order (requireOrderInScope) first.
  const voidWith = async (order) =>
    pos.voidOrder(
      { params: { id: order.id }, order: await orders.fetchOrder(order.id), body: { reason: 'test void' }, user: { id: null } },
      respond(),
    );

  it('retries the refund after an earlier one failed instead of keeping the money', async () => {
    const order = await newOrder({ payment_status: 'refund_failed', payment_method: 'gcash' });
    await addPayment(order.id, { intent_id: 'pi_v', payment_id: 'pay_v', status: 'refund_failed' });

    const res = respond();
    await pos.voidOrder(
      { params: { id: order.id }, order: await orders.fetchOrder(order.id), body: { reason: 'second try' }, user: { id: null } },
      res,
    );

    assert.ok(state.calls.includes('POST /refunds'), 'the refund was attempted again');
    assert.equal(res.body.data.status, 'voided');
  });

  it('does not void while the refund keeps failing', async () => {
    const order = await newOrder({ payment_status: 'refund_failed', payment_method: 'gcash' });
    await addPayment(order.id, { intent_id: 'pi_v2', payment_id: 'pay_v2', status: 'refund_failed' });

    state.refundFails = true;
    await assert.rejects(() => voidWith(order));
    assert.notEqual((await orders.fetchOrder(order.id)).status, 'voided');
  });

  it('cancels a GCash attempt that is still open', async () => {
    const order = await newOrder({ payment_status: 'processing', payment_method: 'gcash' });
    await addPayment(order.id, { intent_id: 'pi_open', status: 'processing' });

    await voidWith(order);

    assert.ok(state.calls.includes('POST /payment_intents/pi_open/cancel'));
    assert.equal((await orders.fetchOrder(order.id)).status, 'voided');
  });
});

describe('payment.paid webhook', () => {
  const paidEvent = (order, intent, amount) => ({
    id: `pay_${intent}`,
    attributes: { payment_intent_id: intent, amount, metadata: { order_id: order.id } },
  });

  it('refunds money that arrives for an order that was voided in the meantime', async () => {
    const order = await newOrder({ payment_status: 'processing', payment_method: 'gcash', status: 'voided' });
    await addPayment(order.id, { intent_id: 'pi_late', status: 'processing' });

    const outcome = await payments.applyWebhookEvent('payment.paid', paidEvent(order, 'pi_late', 10000));

    assert.match(outcome, /refund started/);
    assert.ok(state.calls.includes('POST /refunds'));
    assert.equal((await orders.fetchOrder(order.id)).payment_status, 'refund_pending');
  });

  it('flags the order for an admin when that automatic refund fails', async () => {
    const order = await newOrder({ payment_status: 'processing', payment_method: 'gcash', status: 'cancelled' });
    await addPayment(order.id, { intent_id: 'pi_late2', status: 'processing' });

    state.refundFails = true;
    const outcome = await payments.applyWebhookEvent('payment.paid', paidEvent(order, 'pi_late2', 10000));

    assert.match(outcome, /needs an admin retry/);
    assert.equal((await orders.fetchOrder(order.id)).payment_status, 'refund_failed');
  });

  it('does not refund an ordinary live order', async () => {
    const order = await newOrder({ payment_status: 'processing', payment_method: 'gcash' });
    await addPayment(order.id, { intent_id: 'pi_ok', status: 'processing' });

    const total = Math.round(Number(order.total_amount) * 100);
    const outcome = await payments.applyWebhookEvent('payment.paid', paidEvent(order, 'pi_ok', total));

    assert.match(outcome, /marked paid$/);
    assert.ok(!state.calls.includes('POST /refunds'));
    assert.equal((await orders.fetchOrder(order.id)).payment_status, 'paid');
  });

  it('points out when the amount paid differs from the order total', async () => {
    const order = await newOrder({ payment_status: 'processing', payment_method: 'gcash' });
    await addPayment(order.id, { intent_id: 'pi_diff', status: 'processing' });

    const outcome = await payments.applyWebhookEvent('payment.paid', paidEvent(order, 'pi_diff', 100));
    assert.match(outcome, /AMOUNT MISMATCH/);
  });
});

describe('paying cash for an order with an open GCash attempt', () => {
  it('cancels the GCash attempt first, so it cannot also charge the customer', async () => {
    const order = await newOrder({ payment_status: 'processing', payment_method: 'gcash' });
    await addPayment(order.id, { intent_id: 'pi_abandoned', status: 'processing' });

    const res = respond();
    await pos.payCash(
      { params: { id: order.id }, body: { tendered_amount: Number(order.total_amount) }, user: { id: null } },
      res,
    );

    assert.ok(state.calls.includes('POST /payment_intents/pi_abandoned/cancel'));
    assert.equal(res.body.data.payment_status, 'paid');
    assert.equal(res.body.data.payment_method, 'cash');
  });

  it('refuses when the GCash payment is actually completing', async () => {
    const order = await newOrder({ payment_status: 'processing', payment_method: 'gcash' });
    await addPayment(order.id, { intent_id: 'pi_going', status: 'processing' });

    state.cancelFails = true;
    state.intentStatus = 'processing';
    await assert.rejects(
      () => pos.payCash({ params: { id: order.id }, body: {}, user: { id: null } }, respond()),
      (err) => err.status === 409,
    );
    assert.equal((await orders.fetchOrder(order.id)).payment_status, 'processing');
  });
});
