import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { get, patch, post } from '../helpers/client.js';
import { tokenFor } from '../helpers/auth.js';
import { paymentsFor } from '../helpers/db.js';
import {
  cleanup,
  cleanupKiosks,
  flatPricedProduct,
  issueKioskKey,
  track,
  variantPricedProduct,
} from '../helpers/fixtures.js';

/**
 * JOURNEY: walk-in customer orders at the kiosk and pays cash at the counter.
 *
 *   kiosk order → POS queue → modify → confirm → preparing → ready
 *               → cash settled → completed
 *
 * This is the highest-volume path in the restaurant, so it is asserted
 * step by step rather than only at the end.
 */
describe('E2E: kiosk dine-in paid with cash', () => {
  let kioskKey;
  let cashier;
  let flat;
  let sized;
  let variant;
  let order;

  before(async () => {
    kioskKey = await issueKioskKey('E2E Cash Kiosk');
    cashier = await tokenFor('cashier');
    flat = await flatPricedProduct();
    sized = await variantPricedProduct();
    variant = sized.variants.find((v) => v.price != null);
  });

  after(async () => {
    await cleanup();
    await cleanupKiosks();
  });

  it('step 1: the customer places a dine-in order at the terminal', async () => {
    const res = await post(
      '/kiosk/orders',
      {
        fulfillment_type: 'dine_in',
        customer_name: 'Ana Reyes',
        payment_method: 'cash',
        items: [
          { product_id: flat.id, quantity: 2 },
          { product_id: sized.id, variant_id: variant.id, quantity: 1, notes: 'less spicy' },
        ],
        notes: 'table 4',
      },
      { kioskKey },
    );

    assert.equal(res.status, 201);
    order = res.body.data.order;
    track(order.id);

    assert.equal(order.status, 'pending');
    assert.equal(order.payment_status, 'unpaid');
    assert.equal(res.body.data.payment, null, 'cash is settled at the counter');
    assert.equal(Number(order.total_amount), flat.price * 2 + variant.price);
  });

  it('step 2: the cashier finds it by the name the customer gave', async () => {
    const res = await get('/pos/orders?q=Ana Reyes', { token: cashier });

    assert.equal(res.status, 200);
    const found = res.body.data.find((o) => o.id === order.id);
    assert.ok(found, 'the order must be findable by name');
    assert.equal(found.order_number, order.order_number);
  });

  it('step 3: the customer changes their mind and the cashier edits the order', async () => {
    const res = await patch(
      `/pos/orders/${order.id}/items`,
      { items: [{ product_id: flat.id, quantity: 2 }] },
      { token: cashier },
    );

    assert.equal(res.status, 200);
    assert.equal(Number(res.body.data.total_amount), flat.price * 2);
    assert.equal(res.body.data.order_items.length, 1);
  });

  it('step 4: the cashier accepts the order and the kitchen starts', async () => {
    const confirmed = await post(`/pos/orders/${order.id}/confirm`, undefined, { token: cashier });
    assert.equal(confirmed.body.data.status, 'confirmed');

    const preparing = await patch(
      `/pos/orders/${order.id}/status`,
      { status: 'preparing' },
      { token: cashier },
    );
    assert.equal(preparing.body.data.status, 'preparing');
  });

  it('step 5: the order can no longer be edited once it is being cooked', async () => {
    const res = await patch(
      `/pos/orders/${order.id}/items`,
      { items: [{ product_id: flat.id, quantity: 99 }] },
      { token: cashier },
    );
    assert.equal(res.status, 409);
  });

  it('step 6: the food is ready', async () => {
    const res = await patch(`/pos/orders/${order.id}/status`, { status: 'ready' }, { token: cashier });
    assert.equal(res.body.data.status, 'ready');
  });

  it('step 7: the customer pays with a 500 note and gets change', async () => {
    const res = await post(
      `/pos/orders/${order.id}/payment/cash`,
      { tendered_amount: 500 },
      { token: cashier },
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.data.payment_status, 'paid');
    assert.equal(res.body.meta.change, 500 - flat.price * 2);

    const payments = await paymentsFor(order.id);
    assert.equal(payments.length, 1);
    assert.equal(payments[0].provider, 'cash');
  });

  it('step 8: the order is completed and leaves the open queue', async () => {
    const res = await patch(
      `/pos/orders/${order.id}/status`,
      { status: 'completed' },
      { token: cashier },
    );
    assert.equal(res.body.data.status, 'completed');

    const pending = await get('/pos/orders?status=pending&limit=100', { token: cashier });
    assert.equal(pending.body.data.some((o) => o.id === order.id), false);
  });

  it('step 9: a completed order can no longer be voided', async () => {
    const res = await post(
      `/pos/orders/${order.id}/void`,
      { reason: 'too late' },
      { token: cashier },
    );
    assert.equal(res.status, 409);
  });
});
