import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { get, post } from '../helpers/client.js';
import { tokenFor, userIdFor } from '../helpers/auth.js';
import { orderRow, paymentsFor, setOrderState } from '../helpers/db.js';
import { cleanup, placeOnlineOrder } from '../helpers/fixtures.js';

let rider;
let riderId;
let cashier;

const ADDRESS = { line1: '9 Mabini St', city: 'Davao City' };

/** An online delivery order pushed all the way to `ready` and left unclaimed. */
const readyDelivery = async (overrides = {}) => {
  const order = await placeOnlineOrder('customer', {
    fulfillment_type: 'delivery',
    delivery_address: ADDRESS,
    ...overrides,
  });
  await setOrderState(order.id, { status: 'ready' });
  return order;
};

before(async () => {
  rider = await tokenFor('rider');
  riderId = await userIdFor('rider');
  cashier = await tokenFor('cashier');
});

after(cleanup);

describe('GET /rider/pool', () => {
  it('lists ready, unclaimed delivery orders', async () => {
    const order = await readyDelivery();
    const res = await get('/rider/pool', { token: rider });

    assert.equal(res.status, 200);
    assert.ok(res.body.data.some((o) => o.id === order.id));
  });

  it('excludes orders that are not yet ready', async () => {
    const order = await placeOnlineOrder('customer', {
      fulfillment_type: 'delivery',
      delivery_address: ADDRESS,
    });

    const res = await get('/rider/pool', { token: rider });
    assert.equal(res.body.data.some((o) => o.id === order.id), false);
  });

  it('excludes pickup orders — those are not deliveries', async () => {
    const order = await placeOnlineOrder('customer', { fulfillment_type: 'pickup' });
    await setOrderState(order.id, { status: 'ready' });

    const res = await get('/rider/pool', { token: rider });
    assert.equal(res.body.data.some((o) => o.id === order.id), false);
  });

  it('excludes orders already claimed by someone', async () => {
    const order = await readyDelivery();
    await post(`/rider/orders/${order.id}/claim`, undefined, { token: rider });

    const res = await get('/rider/pool', { token: rider });
    assert.equal(res.body.data.some((o) => o.id === order.id), false);
  });

  it('includes the delivery address, so the rider can navigate', async () => {
    await readyDelivery();
    const res = await get('/rider/pool', { token: rider });
    const withAddress = res.body.data.find((o) => o.delivery_address);
    assert.ok(withAddress, 'pool entries should carry an address');
  });
});

describe('POST /rider/orders/:id/claim', () => {
  it('claims an order and marks it out for delivery', async () => {
    const order = await readyDelivery();
    const res = await post(`/rider/orders/${order.id}/claim`, undefined, { token: rider });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'out_for_delivery');
    assert.equal(res.body.data.rider_id, riderId);
    assert.ok(res.body.data.claimed_at);
  });

  it('409s when the order is already claimed', async () => {
    const order = await readyDelivery();
    await post(`/rider/orders/${order.id}/claim`, undefined, { token: rider });

    const res = await post(`/rider/orders/${order.id}/claim`, undefined, { token: rider });
    assert.equal(res.status, 409);
    assert.match(res.body.error.message, /no longer available/);
  });

  it('409s for an order that is not ready yet', async () => {
    const order = await placeOnlineOrder('customer', {
      fulfillment_type: 'delivery',
      delivery_address: ADDRESS,
    });

    const res = await post(`/rider/orders/${order.id}/claim`, undefined, { token: rider });
    assert.equal(res.status, 409);
  });

  it('409s for a pickup order', async () => {
    const order = await placeOnlineOrder('customer', { fulfillment_type: 'pickup' });
    await setOrderState(order.id, { status: 'ready' });

    const res = await post(`/rider/orders/${order.id}/claim`, undefined, { token: rider });
    assert.equal(res.status, 409);
  });

  it('awards the order to exactly one of two simultaneous claims', async () => {
    const order = await readyDelivery();

    const results = await Promise.all([
      post(`/rider/orders/${order.id}/claim`, undefined, { token: rider }),
      post(`/rider/orders/${order.id}/claim`, undefined, { token: rider }),
    ]);

    const codes = results.map((r) => r.status).sort();
    assert.deepEqual(codes, [200, 409], 'exactly one claim must win');
  });
});

describe('POST /rider/orders/:id/unclaim', () => {
  it('returns the order to the pool', async () => {
    const order = await readyDelivery();
    await post(`/rider/orders/${order.id}/claim`, undefined, { token: rider });

    const res = await post(`/rider/orders/${order.id}/unclaim`, undefined, { token: rider });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'ready');
    assert.equal(res.body.data.rider_id, null);

    const pool = await get('/rider/pool', { token: rider });
    assert.ok(pool.body.data.some((o) => o.id === order.id));
  });

  it('409s when the order is not claimed by this rider', async () => {
    const order = await readyDelivery();
    const res = await post(`/rider/orders/${order.id}/unclaim`, undefined, { token: rider });
    assert.equal(res.status, 409);
  });
});

describe('POST /rider/orders/:id/delivered', () => {
  it('completes the delivery and settles cash on delivery', async () => {
    const order = await readyDelivery();
    await post(`/rider/orders/${order.id}/claim`, undefined, { token: rider });

    const res = await post(
      `/rider/orders/${order.id}/delivered`,
      { collected_amount: Number(order.total_amount) },
      { token: rider },
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'completed');
    assert.equal(res.body.data.payment_status, 'paid');
    assert.ok(res.body.data.delivered_at);

    const payments = await paymentsFor(order.id);
    assert.equal(payments.length, 1);
    assert.equal(payments[0].provider, 'cash');
  });

  it('requires the collected amount for an unpaid order', async () => {
    const order = await readyDelivery();
    await post(`/rider/orders/${order.id}/claim`, undefined, { token: rider });

    const res = await post(`/rider/orders/${order.id}/delivered`, {}, { token: rider });
    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /collected_amount is required/);
  });

  it('rejects collecting less than the total', async () => {
    const order = await readyDelivery();
    await post(`/rider/orders/${order.id}/claim`, undefined, { token: rider });

    const res = await post(
      `/rider/orders/${order.id}/delivered`,
      { collected_amount: 1 },
      { token: rider },
    );
    assert.equal(res.status, 400);
  });

  it('does not require cash for an already-paid order', async () => {
    const order = await readyDelivery();
    await post(`/rider/orders/${order.id}/claim`, undefined, { token: rider });
    await setOrderState(order.id, { payment_status: 'paid', payment_method: 'gcash' });

    const res = await post(`/rider/orders/${order.id}/delivered`, {}, { token: rider });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'completed');

    const payments = await paymentsFor(order.id);
    assert.equal(payments.length, 0, 'a prepaid order needs no cash payment row');
  });

  it('409s when the order was never claimed', async () => {
    const order = await readyDelivery();
    const res = await post(
      `/rider/orders/${order.id}/delivered`,
      { collected_amount: 999 },
      { token: rider },
    );
    assert.ok([403, 409].includes(res.status), `got ${res.status}`);
  });

  it('leaves the order untouched when the amount is rejected', async () => {
    const order = await readyDelivery();
    await post(`/rider/orders/${order.id}/claim`, undefined, { token: rider });
    await post(`/rider/orders/${order.id}/delivered`, { collected_amount: 1 }, { token: rider });

    const row = await orderRow(order.id, 'status, payment_status');
    assert.equal(row.status, 'out_for_delivery');
    assert.equal(row.payment_status, 'unpaid');
  });
});

describe('GET /rider/orders', () => {
  it('lists this rider’s active deliveries', async () => {
    const order = await readyDelivery();
    await post(`/rider/orders/${order.id}/claim`, undefined, { token: rider });

    const res = await get('/rider/orders?active=true', { token: rider });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.some((o) => o.id === order.id));
  });

  it('lists history separately from active work', async () => {
    const order = await readyDelivery();
    await post(`/rider/orders/${order.id}/claim`, undefined, { token: rider });
    await post(
      `/rider/orders/${order.id}/delivered`,
      { collected_amount: Number(order.total_amount) },
      { token: rider },
    );

    const active = await get('/rider/orders?active=true', { token: rider });
    assert.equal(active.body.data.some((o) => o.id === order.id), false);

    const history = await get('/rider/orders?active=false', { token: rider });
    assert.ok(history.body.data.some((o) => o.id === order.id));
  });
});

describe('rider authorization', () => {
  it('403s a cashier reaching for the rider pool', async () => {
    assert.equal((await get('/rider/pool', { token: cashier })).status, 403);
  });

  it('401s with no token', async () => {
    assert.equal((await get('/rider/pool')).status, 401);
  });
});
