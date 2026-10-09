import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { get, post } from '../helpers/client.js';
import { tokenFor } from '../helpers/auth.js';
import { setOrderState } from '../helpers/db.js';
import { branchId, cleanup, flatPricedProduct, placeOnlineOrder } from '../helpers/fixtures.js';

let customer;
let otherCustomer;
let flat;

const ADDRESS = { line1: '123 Rizal St', barangay: 'Poblacion', city: 'Davao City' };

before(async () => {
  customer = await tokenFor('customer');
  otherCustomer = await tokenFor('customer2');
  flat = await flatPricedProduct();
});

after(cleanup);

describe('POST /orders', () => {
  it('creates a pickup order', async () => {
    const order = await placeOnlineOrder('customer');
    assert.equal(order.channel, 'online');
    assert.equal(order.fulfillment_type, 'pickup');
    assert.equal(order.status, 'pending');
    assert.match(order.order_number, /^O-\d{4}$/);
  });

  it('creates a delivery order and stores the address', async () => {
    const order = await placeOnlineOrder('customer', {
      fulfillment_type: 'delivery',
      delivery_address: ADDRESS,
      customer_phone: '09171234567',
    });

    assert.equal(order.fulfillment_type, 'delivery');
    assert.equal(order.delivery_address.city, 'Davao City');
    assert.equal(order.customer_phone, '09171234567');
  });

  it('links the order to the signed-in customer', async () => {
    const order = await placeOnlineOrder('customer');
    assert.ok(order.customer_id);
  });

  it('requires a branch, and refuses one that is not taking orders', async () => {
    const missing = await post(
      '/orders',
      { fulfillment_type: 'pickup', payment_method: 'cash', items: [{ product_id: flat.id, quantity: 1 }] },
      { token: customer },
    );
    assert.equal(missing.status, 400);
    assert.ok(missing.body.error.details.branch_id);

    const unknown = await post(
      '/orders',
      {
        branch_id: '00000000-0000-4000-8000-000000000000',
        fulfillment_type: 'pickup',
        payment_method: 'cash',
        items: [{ product_id: flat.id, quantity: 1 }],
      },
      { token: customer },
    );
    assert.equal(unknown.status, 400);
  });

  it('records the chosen branch on the order', async () => {
    const order = await placeOnlineOrder('customer', { branch_id: await branchId('imus') });
    assert.equal(order.branch_id, await branchId('imus'));
    assert.equal(order.branch.name, 'Imus');
  });

  it('requires an address for delivery, naming the field', async () => {
    const res = await post(
      '/orders',
      {
        branch_id: await branchId(),
        fulfillment_type: 'delivery',
        payment_method: 'cash',
        items: [{ product_id: flat.id, quantity: 1 }],
      },
      { token: customer },
    );

    assert.equal(res.status, 400);
    assert.ok(res.body.error.details.delivery_address);
  });

  it('does not store an address on a pickup order', async () => {
    const order = await placeOnlineOrder('customer', {
      fulfillment_type: 'pickup',
      delivery_address: ADDRESS,
    });
    assert.equal(order.delivery_address, null);
  });

  it('rejects counter fulfillment types', async () => {
    for (const type of ['dine_in', 'take_out']) {
      const res = await post(
        '/orders',
        {
          branch_id: await branchId(),
          fulfillment_type: type,
          payment_method: 'cash',
          items: [{ product_id: flat.id, quantity: 1 }],
        },
        { token: customer },
      );
      assert.equal(res.status, 400, type);
    }
  });

  it('401s without a token', async () => {
    const res = await post('/orders', {
      branch_id: await branchId(),
      fulfillment_type: 'pickup',
      payment_method: 'cash',
      items: [{ product_id: flat.id, quantity: 1 }],
    });
    assert.equal(res.status, 401);
  });

  it('prices from the menu, not from the request', async () => {
    const order = await placeOnlineOrder('customer', {
      items: [{ product_id: flat.id, quantity: 2 }],
      total_amount: 0.01,
    });
    assert.equal(Number(order.total_amount), flat.price * 2);
  });
});

describe('GET /orders', () => {
  it('returns only the caller’s own orders', async () => {
    const mine = await placeOnlineOrder('customer');
    const theirs = await placeOnlineOrder('customer2');

    const res = await get('/orders?limit=100', { token: customer });
    const ids = res.body.data.map((o) => o.id);

    assert.ok(ids.includes(mine.id));
    assert.equal(ids.includes(theirs.id), false, 'must not leak another customer’s order');
  });

  it('filters by status', async () => {
    await placeOnlineOrder('customer');
    const res = await get('/orders?status=pending', { token: customer });
    for (const order of res.body.data) assert.equal(order.status, 'pending');
  });

  it('paginates', async () => {
    const res = await get('/orders?limit=1', { token: customer });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length <= 1);
    assert.ok('pages' in res.body.meta);
  });

  it('401s without a token', async () => {
    assert.equal((await get('/orders')).status, 401);
  });
});

describe('GET /orders/:id', () => {
  it('returns the caller’s own order with its items', async () => {
    const order = await placeOnlineOrder('customer');
    const res = await get(`/orders/${order.id}`, { token: customer });

    assert.equal(res.status, 200);
    assert.ok(res.body.data.order_items.length > 0);
  });

  it('404s another customer’s order rather than 403 — existence is not leaked', async () => {
    const order = await placeOnlineOrder('customer');
    const res = await get(`/orders/${order.id}`, { token: otherCustomer });
    assert.equal(res.status, 404);
  });
});

describe('POST /orders/:id/cancel', () => {
  it('cancels an unpaid pending order', async () => {
    const order = await placeOnlineOrder('customer');
    const res = await post(`/orders/${order.id}/cancel`, undefined, { token: customer });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'cancelled');
  });

  it('cancels a confirmed order that has not been paid', async () => {
    const order = await placeOnlineOrder('customer');
    await setOrderState(order.id, { status: 'confirmed' });

    const res = await post(`/orders/${order.id}/cancel`, undefined, { token: customer });
    assert.equal(res.status, 200);
  });

  it('refuses once the kitchen has started', async () => {
    const order = await placeOnlineOrder('customer');
    await setOrderState(order.id, { status: 'preparing' });

    const res = await post(`/orders/${order.id}/cancel`, undefined, { token: customer });
    assert.equal(res.status, 409);
  });

  it('refuses a paid order — that is a void, with a refund', async () => {
    const order = await placeOnlineOrder('customer');
    await setOrderState(order.id, { payment_status: 'paid' });

    const res = await post(`/orders/${order.id}/cancel`, undefined, { token: customer });
    assert.equal(res.status, 409);
    assert.match(res.body.error.message, /already paid|no longer be cancelled/);
  });

  it('will not let one customer cancel another’s order', async () => {
    const order = await placeOnlineOrder('customer');
    const res = await post(`/orders/${order.id}/cancel`, undefined, { token: otherCustomer });

    assert.equal(res.status, 409);

    const check = await get(`/orders/${order.id}`, { token: customer });
    assert.equal(check.body.data.status, 'pending', 'order must be untouched');
  });
});

describe('POST /orders/:id/payment', () => {
  it('503s while PayMongo is unconfigured', async (t) => {
    const order = await placeOnlineOrder('customer');
    const res = await post(`/orders/${order.id}/payment`, undefined, { token: customer });

    if (res.status === 200) return t.skip('PayMongo is configured in this environment');
    assert.equal(res.status, 503);
  });

  it('404s before reaching the payment provider for someone else’s order', async () => {
    const order = await placeOnlineOrder('customer');
    const res = await post(`/orders/${order.id}/payment`, undefined, { token: otherCustomer });
    assert.equal(res.status, 404);
  });
});
