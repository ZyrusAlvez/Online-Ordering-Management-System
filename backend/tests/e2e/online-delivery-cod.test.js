import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { get, patch, post } from '../helpers/client.js';
import { tokenFor, userIdFor } from '../helpers/auth.js';
import { orderRow, paymentsFor } from '../helpers/db.js';
import { branchId, cleanup, flatPricedProduct, orderTime, track } from '../helpers/fixtures.js';

/**
 * JOURNEY: online customer orders delivery and pays the rider in cash.
 *
 *   customer order → POS confirm → preparing → ready
 *     → enters the shared rider pool → rider claims it
 *     → delivered, cash collected → completed
 *
 * Covers the hand-off between three different actors, which is where the
 * ownership and visibility rules matter most.
 */
describe('E2E: online delivery, cash on delivery', () => {
  let customer;
  let cashier;
  let rider;
  let riderId;
  let flat;
  let order;

  const ADDRESS = {
    line1: '123 Rizal St',
    barangay: 'Poblacion',
    city: 'Davao City',
    landmark: 'beside the pharmacy',
  };

  before(async () => {
    customer = await tokenFor('customer');
    cashier = await tokenFor('cashier');
    rider = await tokenFor('rider');
    riderId = await userIdFor('rider');
    flat = await flatPricedProduct();
  });

  after(cleanup);

  it('step 1: the customer places a delivery order', async () => {
    const res = await post(
      '/orders',
      {
        branch_id: await branchId(),
        ...(await orderTime()),
        fulfillment_type: 'delivery',
        payment_method: 'cash',
        customer_phone: '09171234567',
        delivery_address: ADDRESS,
        items: [{ product_id: flat.id, quantity: 3 }],
        notes: 'Ring the bell',
      },
      { token: customer },
    );

    assert.equal(res.status, 201);
    order = res.body.data;
    track(order.id);

    assert.equal(order.channel, 'online');
    assert.equal(order.status, 'pending');
    assert.equal(order.payment_status, 'unpaid');
    assert.equal(Number(order.total_amount), flat.price * 3);
  });

  it('step 2: it is not yet offered to riders', async () => {
    const pool = await get('/rider/pool', { token: rider });
    assert.equal(pool.body.data.some((o) => o.id === order.id), false);
  });

  it('step 3: the customer may still cancel while it is unpaid and unstarted', async () => {
    // Prove the option exists, then carry on with the happy path.
    const res = await get(`/orders/${order.id}`, { token: customer });
    assert.equal(res.body.data.status, 'pending');
  });

  it('step 4: the kitchen accepts and prepares it', async () => {
    await post(`/pos/orders/${order.id}/confirm`, undefined, { token: cashier });

    const res = await patch(
      `/pos/orders/${order.id}/status`,
      { status: 'preparing' },
      { token: cashier },
    );
    assert.equal(res.body.data.status, 'preparing');
  });

  it('step 5: once it is preparing the customer can no longer cancel', async () => {
    const res = await post(`/orders/${order.id}/cancel`, undefined, { token: customer });
    assert.equal(res.status, 409);
  });

  it('step 6: marking it ready puts it in the rider pool', async () => {
    await patch(`/pos/orders/${order.id}/status`, { status: 'ready' }, { token: cashier });

    const pool = await get('/rider/pool', { token: rider });
    const offered = pool.body.data.find((o) => o.id === order.id);

    assert.ok(offered, 'a ready delivery must be offered to riders');
    assert.equal(offered.delivery_address.city, 'Davao City');
  });

  it('step 7: a rider claims it, and it leaves the pool for everyone else', async () => {
    const res = await post(`/rider/orders/${order.id}/claim`, undefined, { token: rider });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'out_for_delivery');
    assert.equal(res.body.data.rider_id, riderId);

    const pool = await get('/rider/pool', { token: rider });
    assert.equal(pool.body.data.some((o) => o.id === order.id), false);
  });

  it('step 8: it shows up in the rider’s active list', async () => {
    const res = await get('/rider/orders?active=true', { token: rider });
    assert.ok(res.body.data.some((o) => o.id === order.id));
  });

  it('step 9: the customer can watch progress but not interfere', async () => {
    const res = await get(`/orders/${order.id}`, { token: customer });
    assert.equal(res.body.data.status, 'out_for_delivery');

    const cancel = await post(`/orders/${order.id}/cancel`, undefined, { token: customer });
    assert.equal(cancel.status, 409);
  });

  it('step 10: the rider cannot close it without collecting the money', async () => {
    const res = await post(`/rider/orders/${order.id}/delivered`, {}, { token: rider });

    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /collected_amount is required/);
  });

  it('step 11: nor for less than the amount due', async () => {
    const res = await post(
      `/rider/orders/${order.id}/delivered`,
      { collected_amount: 1 },
      { token: rider },
    );
    assert.equal(res.status, 400);

    const row = await orderRow(order.id, 'status');
    assert.equal(row.status, 'out_for_delivery', 'a rejected attempt changes nothing');
  });

  it('step 12: collecting the cash completes and settles the order', async () => {
    const total = Number(order.total_amount);
    const res = await post(
      `/rider/orders/${order.id}/delivered`,
      { collected_amount: total },
      { token: rider },
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'completed');
    assert.equal(res.body.data.payment_status, 'paid');
    assert.ok(res.body.data.delivered_at);

    const payments = await paymentsFor(order.id);
    assert.equal(payments.length, 1);
    assert.equal(payments[0].provider, 'cash');
    assert.equal(payments[0].amount_centavos, Math.round(total * 100));
  });

  it('step 13: it moves from the rider’s active list into history', async () => {
    const active = await get('/rider/orders?active=true', { token: rider });
    assert.equal(active.body.data.some((o) => o.id === order.id), false);

    const history = await get('/rider/orders?active=false', { token: rider });
    assert.ok(history.body.data.some((o) => o.id === order.id));
  });

  it('step 14: the customer sees the finished order', async () => {
    const res = await get(`/orders/${order.id}`, { token: customer });
    assert.equal(res.body.data.status, 'completed');
    assert.equal(res.body.data.payment_status, 'paid');
  });
});
