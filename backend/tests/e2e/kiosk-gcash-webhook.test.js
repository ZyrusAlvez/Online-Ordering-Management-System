import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { get, patch, request } from '../helpers/client.js';
import { tokenFor } from '../helpers/auth.js';
import { db, orderRow } from '../helpers/db.js';
import { cleanup, cleanupKiosks, issueKioskKey, placeKioskOrder } from '../helpers/fixtures.js';

const SECRET = process.env.TEST_WEBHOOK_SECRET ?? 'whsk_testsecret123';

const sendWebhook = (payload) => {
  const body = JSON.stringify(payload);
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', SECRET).update(`${t}.${body}`, 'utf8').digest('hex');

  return request('POST', '/webhooks/paymongo', {
    body,
    raw: true,
    headers: {
      'Content-Type': 'application/json',
      'Paymongo-Signature': `t=${t},te=${sig},li=${sig}`,
    },
  });
};

/**
 * JOURNEY: kiosk customer pays by GCash at the terminal.
 *
 *   kiosk order (processing) → PayMongo webhook confirms payment
 *     → auto-confirmed to the kitchen, no cashier involved
 *     → preparing → ready → completed
 *
 * The outbound call to PayMongo needs live credentials, so the intent is
 * simulated; everything from the webhook onwards is the real code path.
 */
describe('E2E: kiosk GCash payment confirmed by webhook', () => {
  let kioskKey;
  let cashier;
  let order;
  let intentId;

  before(async () => {
    kioskKey = await issueKioskKey('E2E GCash Kiosk');
    cashier = await tokenFor('cashier');
  });

  after(async () => {
    await db.from('webhook_events').delete().like('event_id', 'evt_e2e_%');
    await cleanup();
    await cleanupKiosks();
  });

  it('step 1: the customer orders and chooses GCash', async () => {
    const placed = await placeKioskOrder(kioskKey, { customer_name: 'GCash Customer' });
    order = placed.order;

    // Stand in for startGcashPayment, which needs live PayMongo credentials.
    intentId = `pi_e2e_${Date.now()}`;
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

    const row = await orderRow(order.id, 'status, payment_status');
    assert.equal(row.payment_status, 'processing');
    assert.equal(row.status, 'pending', 'not in the kitchen until it is paid');
  });

  it('step 2: while unpaid, the kiosk polls and sees no progress', async () => {
    const res = await get(`/kiosk/orders/${order.id}`, { kioskKey });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.payment_status, 'processing');
    assert.equal(res.body.data.status, 'pending');
  });

  it('step 3: PayMongo confirms the payment', async () => {
    const res = await sendWebhook({
      data: {
        id: `evt_e2e_paid_${Date.now()}`,
        type: 'event',
        attributes: {
          type: 'payment.paid',
          data: {
            id: `pay_e2e_${Date.now()}`,
            attributes: {
              payment_intent_id: intentId,
              status: 'paid',
              metadata: { order_id: order.id },
            },
          },
        },
      },
    });

    assert.equal(res.status, 200);
  });

  it('step 4: the order is paid AND already confirmed — no queueing at the till', async () => {
    const res = await get(`/kiosk/orders/${order.id}`, { kioskKey });

    assert.equal(res.body.data.payment_status, 'paid');
    assert.equal(res.body.data.status, 'confirmed');
  });

  it('step 5: it appears in the kitchen queue as an already-paid order', async () => {
    const res = await get('/pos/orders?status=confirmed&limit=100', { token: cashier });
    const found = res.body.data.find((o) => o.id === order.id);

    assert.ok(found);
    assert.equal(found.payment_status, 'paid');
  });

  it('step 6: the cashier cannot charge an already-paid order again', async () => {
    const { post } = await import('../helpers/client.js');
    const res = await post(`/pos/orders/${order.id}/payment/cash`, {}, { token: cashier });
    assert.equal(res.status, 409);
  });

  it('step 7: the kitchen finishes and the customer collects', async () => {
    for (const status of ['preparing', 'ready', 'completed']) {
      const res = await patch(`/pos/orders/${order.id}/status`, { status }, { token: cashier });
      assert.equal(res.status, 200, `advancing to ${status}`);
    }

    const row = await orderRow(order.id, 'status, payment_status');
    assert.equal(row.status, 'completed');
    assert.equal(row.payment_status, 'paid');
  });
});
