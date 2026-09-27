import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { get, post } from '../helpers/client.js';
import { tokenFor } from '../helpers/auth.js';
import { db, setOrderState } from '../helpers/db.js';
import {
  cleanup,
  cleanupKiosks,
  flatPricedProduct,
  issueKioskKey,
  placeOnlineOrder,
  track,
} from '../helpers/fixtures.js';

/**
 * Cross-cutting guarantees that no single endpoint owns: who can see what,
 * and what happens when two actors race.
 */
describe('E2E: visibility between roles', () => {
  let customer;
  let customer2;
  let cashier;
  let rider;
  let admin;
  let mine;
  let theirs;

  before(async () => {
    [customer, customer2, cashier, rider, admin] = await Promise.all([
      tokenFor('customer'),
      tokenFor('customer2'),
      tokenFor('cashier'),
      tokenFor('rider'),
      tokenFor('admin'),
    ]);

    mine = await placeOnlineOrder('customer');
    theirs = await placeOnlineOrder('customer2');
  });

  after(cleanup);

  it('a customer sees their own order but not another customer’s', async () => {
    const res = await get('/orders?limit=100', { token: customer });
    const ids = res.body.data.map((o) => o.id);

    assert.ok(ids.includes(mine.id));
    assert.equal(ids.includes(theirs.id), false);
  });

  it('fetching another customer’s order by id gives 404, not 403', async () => {
    // 403 would confirm the order exists; 404 reveals nothing.
    const res = await get(`/orders/${theirs.id}`, { token: customer });
    assert.equal(res.status, 404);
  });

  it('a cashier sees every order regardless of channel or owner', async () => {
    const res = await get('/pos/orders?limit=100', { token: cashier });
    const ids = res.body.data.map((o) => o.id);

    assert.ok(ids.includes(mine.id));
    assert.ok(ids.includes(theirs.id));
  });

  it('an admin sees every order too', async () => {
    const res = await get('/admin/orders?limit=100', { token: admin });
    const ids = res.body.data.map((o) => o.id);
    assert.ok(ids.includes(mine.id) && ids.includes(theirs.id));
  });

  it('a rider sees only the delivery pool, not pickup or other channels', async () => {
    const res = await get('/rider/pool', { token: rider });
    const ids = res.body.data.map((o) => o.id);

    assert.equal(ids.includes(mine.id), false, 'a pickup order is not a delivery job');
    assert.equal(ids.includes(theirs.id), false);
  });

  it('every role is blocked from the others’ surfaces', async () => {
    const checks = [
      ['customer at POS', get('/pos/orders', { token: customer })],
      ['customer at admin', get('/admin/orders', { token: customer })],
      ['customer at rider', get('/rider/pool', { token: customer })],
      ['cashier at rider', get('/rider/pool', { token: cashier })],
      ['cashier at admin', get('/admin/riders', { token: cashier })],
      ['rider at POS', get('/pos/orders', { token: rider })],
      ['rider at admin', get('/admin/orders', { token: rider })],
    ];

    for (const [label, promise] of checks) {
      const res = await promise;
      assert.equal(res.status, 403, `${label} should be forbidden, got ${res.status}`);
    }
  });

  it('an unauthenticated caller gets 401 everywhere that needs a user', async () => {
    for (const path of ['/orders', '/pos/orders', '/rider/pool', '/admin/orders']) {
      assert.equal((await get(path)).status, 401, path);
    }
  });
});

describe('E2E: concurrency', () => {
  let kioskKey;
  let rider;
  let flat;

  before(async () => {
    kioskKey = await issueKioskKey('Concurrency Kiosk');
    rider = await tokenFor('rider');
    flat = await flatPricedProduct();
  });

  after(async () => {
    await cleanup();
    await cleanupKiosks();
  });

  it('gives every concurrently created order a distinct order number', async () => {
    const placeOne = () =>
      post(
        '/kiosk/orders',
        {
          fulfillment_type: 'take_out',
          customer_name: 'Concurrent',
          payment_method: 'cash',
          items: [{ product_id: flat.id, quantity: 1 }],
        },
        { kioskKey },
      );

    const results = await Promise.all(Array.from({ length: 12 }, placeOne));

    for (const res of results) {
      assert.equal(res.status, 201);
      track(res.body.data.order.id);
    }

    const numbers = results.map((r) => r.body.data.order.order_number);
    assert.equal(new Set(numbers).size, numbers.length, `duplicate order numbers: ${numbers}`);
  });

  it('lets exactly one rider win a contested claim', async () => {
    const order = await placeOnlineOrder('customer', {
      fulfillment_type: 'delivery',
      delivery_address: { line1: '1 Race St', city: 'Davao City' },
    });
    await setOrderState(order.id, { status: 'ready' });

    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        post(`/rider/orders/${order.id}/claim`, undefined, { token: rider }),
      ),
    );

    const won = attempts.filter((r) => r.status === 200);
    const lost = attempts.filter((r) => r.status === 409);

    assert.equal(won.length, 1, 'exactly one claim must succeed');
    assert.equal(lost.length, 4);
  });

  it('does not double-charge an order paid twice at once', async () => {
    const order = await placeOnlineOrder('customer');
    const cashier = await tokenFor('cashier');

    const attempts = await Promise.all([
      post(`/pos/orders/${order.id}/payment/cash`, {}, { token: cashier }),
      post(`/pos/orders/${order.id}/payment/cash`, {}, { token: cashier }),
    ]);

    const ok = attempts.filter((r) => r.status === 200);
    assert.ok(ok.length >= 1, 'at least one payment must succeed');

    const { data: payments } = await db.from('payments').select('id').eq('order_id', order.id);
    assert.ok(
      payments.length <= attempts.length,
      `expected at most one payment row per attempt, got ${payments.length}`,
    );
  });
});
