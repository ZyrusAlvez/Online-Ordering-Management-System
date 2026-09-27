import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { get, post } from '../helpers/client.js';
import { db } from '../helpers/db.js';
import {
  cleanup,
  cleanupKiosks,
  flatPricedProduct,
  issueKioskKey,
  placeKioskOrder,
  track,
  unpricedProduct,
  variantPricedProduct,
} from '../helpers/fixtures.js';

let kioskKey;
let otherKioskKey;
let flat;

before(async () => {
  kioskKey = await issueKioskKey('Integration Kiosk A');
  otherKioskKey = await issueKioskKey('Integration Kiosk B');
  flat = await flatPricedProduct();
});

after(async () => {
  await cleanup();
  await cleanupKiosks();
});

describe('kiosk device authentication', () => {
  it('rejects a request with no device key', async () => {
    const res = await post('/kiosk/orders', {});
    assert.equal(res.status, 401);
    assert.match(res.body.error.message, /Missing kiosk device key/);
  });

  it('rejects an unknown device key', async () => {
    const res = await post('/kiosk/orders', {}, { kioskKey: 'kiosk_madeupkey' });
    assert.equal(res.status, 401);
    assert.match(res.body.error.message, /Unknown kiosk device key/);
  });

  it('rejects a revoked device', async () => {
    const key = await issueKioskKey('Doomed Kiosk');
    const { tokenFor } = await import('../helpers/auth.js');
    const { get: apiGet, del } = await import('../helpers/client.js');

    const admin = await tokenFor('admin');
    const list = await apiGet('/admin/kiosks', { token: admin });
    const device = list.body.data.find((d) => d.name === 'Doomed Kiosk');
    await del(`/admin/kiosks/${device.id}`, { token: admin });

    const res = await post(
      '/kiosk/orders',
      {
        fulfillment_type: 'dine_in',
        customer_name: 'X',
        payment_method: 'cash',
        items: [{ product_id: flat.id, quantity: 1 }],
      },
      { kioskKey: key },
    );

    assert.equal(res.status, 403);
    assert.match(res.body.error.message, /deactivated/);
  });
});

describe('POST /kiosk/orders', () => {
  it('creates a pending, unpaid cash order', async () => {
    const { order, payment } = await placeKioskOrder(kioskKey, { customer_name: 'Ana Reyes' });

    assert.equal(order.status, 'pending');
    assert.equal(order.payment_status, 'unpaid');
    assert.equal(order.channel, 'kiosk');
    assert.equal(order.customer_name, 'Ana Reyes');
    assert.equal(payment, null, 'cash needs no payment object');
  });

  it('assigns a K-prefixed order number', async () => {
    const { order } = await placeKioskOrder(kioskKey);
    assert.match(order.order_number, /^K-\d{4}$/);
  });

  it('records which terminal took the order', async () => {
    const { order } = await placeKioskOrder(kioskKey);
    assert.ok(order.kiosk_device_id);
  });

  it('prices the order from the menu, ignoring any client total', async () => {
    const { order } = await placeKioskOrder(kioskKey, {
      items: [{ product_id: flat.id, quantity: 3 }],
      total_amount: 1,
    });

    assert.equal(Number(order.total_amount), flat.price * 3);
  });

  it('prices a variant-priced product from the chosen variant', async () => {
    const product = await variantPricedProduct();
    const variant = product.variants.find((v) => v.price != null);

    const { order } = await placeKioskOrder(kioskKey, {
      items: [{ product_id: product.id, variant_id: variant.id, quantity: 2 }],
    });

    assert.equal(Number(order.total_amount), variant.price * 2);
  });

  it('sums a multi-line order', async () => {
    const product = await variantPricedProduct();
    const variant = product.variants.find((v) => v.price != null);

    const { order } = await placeKioskOrder(kioskKey, {
      items: [
        { product_id: flat.id, quantity: 2 },
        { product_id: product.id, variant_id: variant.id, quantity: 1 },
      ],
    });

    assert.equal(Number(order.total_amount), flat.price * 2 + variant.price);
    assert.equal(order.order_items.length, 2);
  });

  it('keeps per-line notes', async () => {
    const { order } = await placeKioskOrder(kioskKey, {
      items: [{ product_id: flat.id, quantity: 1, notes: 'no onions' }],
    });
    assert.equal(order.order_items[0].notes, 'no onions');
  });

  it('rejects a delivery — a kiosk is inside the restaurant', async () => {
    const res = await post(
      '/kiosk/orders',
      {
        fulfillment_type: 'delivery',
        customer_name: 'X',
        payment_method: 'cash',
        items: [{ product_id: flat.id, quantity: 1 }],
      },
      { kioskKey },
    );
    assert.equal(res.status, 400);
  });

  it('rejects an empty cart', async () => {
    const res = await post(
      '/kiosk/orders',
      { fulfillment_type: 'dine_in', customer_name: 'X', payment_method: 'cash', items: [] },
      { kioskKey },
    );
    assert.equal(res.status, 400);
  });

  it('rejects a missing customer name', async () => {
    const res = await post(
      '/kiosk/orders',
      {
        fulfillment_type: 'dine_in',
        payment_method: 'cash',
        items: [{ product_id: flat.id, quantity: 1 }],
      },
      { kioskKey },
    );
    assert.equal(res.status, 400);
  });

  it('rejects an unknown product', async () => {
    const res = await post(
      '/kiosk/orders',
      {
        fulfillment_type: 'dine_in',
        customer_name: 'X',
        payment_method: 'cash',
        items: [{ product_id: '00000000-0000-4000-8000-000000000000', quantity: 1 }],
      },
      { kioskKey },
    );
    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /Unknown product/);
  });

  it('rejects a variant that belongs to a different product', async () => {
    const product = await variantPricedProduct();
    const res = await post(
      '/kiosk/orders',
      {
        fulfillment_type: 'dine_in',
        customer_name: 'X',
        payment_method: 'cash',
        items: [{ product_id: flat.id, variant_id: product.variants[0].id, quantity: 1 }],
      },
      { kioskKey },
    );

    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /does not belong to/);
  });

  it('rejects an item whose price has never been set', async (t) => {
    const product = await unpricedProduct();
    if (!product) return t.skip('no unpriced product in the menu');

    const res = await post(
      '/kiosk/orders',
      {
        fulfillment_type: 'dine_in',
        customer_name: 'X',
        payment_method: 'cash',
        items: [{ product_id: product.id, variant_id: product.variants[0].id, quantity: 1 }],
      },
      { kioskKey },
    );

    assert.equal(res.status, 409);
    assert.match(res.body.error.message, /Price not yet set/);
  });

  it('returns 503 for GCash while PayMongo is unconfigured', async (t) => {
    const res = await post(
      '/kiosk/orders',
      {
        fulfillment_type: 'dine_in',
        customer_name: 'Gcash Unconfigured Probe',
        payment_method: 'gcash',
        items: [{ product_id: flat.id, quantity: 1 }],
      },
      { kioskKey },
    );

    if (res.status === 201) return t.skip('PayMongo is configured in this environment');
    assert.equal(res.status, 503);
  });

  it('leaves no orphaned order behind when starting the payment fails', async (t) => {
    const marker = `Orphan Probe ${Date.now()}`;

    const res = await post(
      '/kiosk/orders',
      {
        fulfillment_type: 'dine_in',
        customer_name: marker,
        payment_method: 'gcash',
        items: [{ product_id: flat.id, quantity: 1 }],
      },
      { kioskKey },
    );

    if (res.status === 201) {
      track(res.body.data.order.id);
      return t.skip('PayMongo is configured; the failure path was not exercised');
    }

    // The customer got an error and never learned an order id, so an order
    // left in `pending` would sit in the cashier's queue forever, unpayable.
    const { data: stranded } = await db
      .from('orders')
      .select('id')
      .eq('customer_name', marker);

    assert.deepEqual(stranded, [], 'the failed order must be rolled back');
  });
});

describe('GET /kiosk/orders/:id', () => {
  it('returns the order to the device that created it', async () => {
    const { order } = await placeKioskOrder(kioskKey);
    const res = await get(`/kiosk/orders/${order.id}`, { kioskKey });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.id, order.id);
  });

  it('hides another terminal’s order behind a 404', async () => {
    const { order } = await placeKioskOrder(kioskKey);
    const res = await get(`/kiosk/orders/${order.id}`, { kioskKey: otherKioskKey });

    assert.equal(res.status, 404);
  });

  it('404s an unknown order', async () => {
    const res = await get('/kiosk/orders/00000000-0000-4000-8000-000000000000', { kioskKey });
    assert.equal(res.status, 404);
  });

  it('400s a malformed id', async () => {
    assert.equal((await get('/kiosk/orders/nope', { kioskKey })).status, 400);
  });
});
