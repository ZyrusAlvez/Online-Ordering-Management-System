import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { request } from '../helpers/client.js';
import { db, orderRow, paymentsFor } from '../helpers/db.js';
import { cleanup, cleanupKiosks, flatPricedProduct, issueKioskKey, placeKioskOrder, track } from '../helpers/fixtures.js';

const SECRET = process.env.TEST_WEBHOOK_SECRET ?? 'whsk_testsecret123';

const send = (payload, { secret = SECRET, timestamp = Math.floor(Date.now() / 1000) } = {}) => {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const sig = createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');

  return request('POST', '/webhooks/paymongo', {
    body,
    raw: true,
    headers: {
      'Content-Type': 'application/json',
      'Paymongo-Signature': `t=${timestamp},te=${sig},li=${sig}`,
    },
  });
};

const event = (id, type, resource) => ({
  data: { id, type: 'event', attributes: { type, data: resource } },
});

let kioskKey;

/** A kiosk order parked in `processing`, as startGcashPayment would leave it. */
const pendingGcashOrder = async () => {
  const { order } = await placeKioskOrder(kioskKey);
  const intentId = `pi_test_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  await db
    .from('orders')
    .update({ payment_status: 'processing', payment_method: 'gcash' })
    .eq('id', order.id);

  await db.from('payments').insert({
    order_id: order.id,
    provider: 'paymongo',
    intent_id: intentId,
    amount_centavos: Math.round(Number(order.total_amount) * 100),
    status: 'processing',
  });

  return { order, intentId };
};

before(async () => {
  await flatPricedProduct();
  kioskKey = await issueKioskKey('Webhook Test Kiosk');
});

after(async () => {
  await db.from('webhook_events').delete().like('event_id', 'evt_test_%');
  await cleanup();
  await cleanupKiosks();
});

describe('webhook signature enforcement', () => {
  it('rejects an unsigned request', async () => {
    const res = await request('POST', '/webhooks/paymongo', {
      body: '{}',
      raw: true,
      headers: { 'Content-Type': 'application/json' },
    });
    assert.equal(res.status, 401);
  });

  it('rejects a wrong signing secret', async () => {
    const res = await send(event('evt_test_bad', 'payment.paid', {}), { secret: 'whsk_wrong' });
    assert.equal(res.status, 401);
  });

  it('rejects a stale timestamp, blocking replay', async () => {
    const res = await send(event('evt_test_old', 'payment.paid', {}), {
      timestamp: Math.floor(Date.now() / 1000) - 3600,
    });
    assert.equal(res.status, 401);
  });

  it('rejects a body modified after signing', async () => {
    const payload = JSON.stringify(event('evt_test_tamper', 'payment.paid', {}));
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac('sha256', SECRET).update(`${t}.${payload}`, 'utf8').digest('hex');

    const res = await request('POST', '/webhooks/paymongo', {
      body: payload.replace('payment.paid', 'payment.failed'),
      raw: true,
      headers: {
        'Content-Type': 'application/json',
        'Paymongo-Signature': `t=${t},te=${sig},li=${sig}`,
      },
    });
    assert.equal(res.status, 401);
  });
});

describe('payment.paid', () => {
  it('marks the order paid and settles the payment row', async () => {
    const { order, intentId } = await pendingGcashOrder();
    const paymentId = `pay_test_${Date.now()}`;

    const res = await send(
      event(`evt_test_paid_${Date.now()}`, 'payment.paid', {
        id: paymentId,
        attributes: { payment_intent_id: intentId, status: 'paid', metadata: { order_id: order.id } },
      }),
    );

    assert.equal(res.status, 200);

    const row = await orderRow(order.id, 'status, payment_status');
    assert.equal(row.payment_status, 'paid');

    const payments = await paymentsFor(order.id);
    assert.equal(payments[0].status, 'paid');
    assert.equal(payments[0].payment_id, paymentId);
  });

  it('sends a paid kiosk order straight to the kitchen', async () => {
    const { order, intentId } = await pendingGcashOrder();

    await send(
      event(`evt_test_kiosk_${Date.now()}`, 'payment.paid', {
        id: `pay_test_${Date.now()}`,
        attributes: { payment_intent_id: intentId, metadata: { order_id: order.id } },
      }),
    );

    const row = await orderRow(order.id, 'status');
    assert.equal(row.status, 'confirmed', 'kiosk self-service should not queue at the counter');
  });

  it('ignores an event that matches no known order', async () => {
    const res = await send(
      event(`evt_test_orphan_${Date.now()}`, 'payment.paid', {
        id: 'pay_unknown',
        attributes: { payment_intent_id: 'pi_nonexistent' },
      }),
    );
    assert.equal(res.status, 200, 'an unmatched event is acknowledged, not retried forever');
  });
});

describe('idempotency', () => {
  it('applies a repeated delivery only once', async () => {
    const { order, intentId } = await pendingGcashOrder();
    const eventId = `evt_test_dup_${Date.now()}`;
    const payload = event(eventId, 'payment.paid', {
      id: `pay_test_${Date.now()}`,
      attributes: { payment_intent_id: intentId, metadata: { order_id: order.id } },
    });

    const first = await send(payload);
    const second = await send(payload);

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(second.body.duplicate, true);

    const { count } = await db
      .from('webhook_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId);
    assert.equal(count, 1);
  });
});

describe('payment.failed', () => {
  it('records the failure without confirming the order', async () => {
    const { order, intentId } = await pendingGcashOrder();

    await send(
      event(`evt_test_fail_${Date.now()}`, 'payment.failed', {
        id: `pay_test_${Date.now()}`,
        attributes: { payment_intent_id: intentId, metadata: { order_id: order.id } },
      }),
    );

    const row = await orderRow(order.id, 'status, payment_status');
    assert.equal(row.payment_status, 'failed');
    assert.equal(row.status, 'pending', 'a failed payment must not reach the kitchen');
  });
});

describe('unknown event types', () => {
  it('acknowledges without acting', async () => {
    const res = await send(
      event(`evt_test_unknown_${Date.now()}`, 'some.future.event', { id: 'x' }),
    );
    assert.equal(res.status, 200);
  });

  it('acknowledges a structurally unexpected payload', async () => {
    const res = await send({ hello: 'world' });
    assert.equal(res.status, 200);
    assert.equal(res.body.handled, false);
  });
});
