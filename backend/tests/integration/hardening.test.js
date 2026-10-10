import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { del, get, patch, post } from '../helpers/client.js';
import { tokenFor, userIdFor } from '../helpers/auth.js';
import { db, orderRow, paymentsFor, setOrderState } from '../helpers/db.js';
import {
  allProducts,
  branchId,
  cleanup,
  orderTime,
  flatPricedProduct,
  placeOnlineOrder,
  placeWalkInOrder,
  track,
} from '../helpers/fixtures.js';

let admin;
let cashier;
let customer;
let customer2;
let rider;
let flat;
let gma;

before(async () => {
  [admin, cashier, customer, customer2, rider] = await Promise.all([
    tokenFor('admin'),
    tokenFor('cashier'),
    tokenFor('customer'),
    tokenFor('customer2'),
    tokenFor('rider'),
  ]);
  flat = await flatPricedProduct();
  gma = await branchId('gma');
});

after(cleanup);

/** A client that acts as a signed-in customer using the public key, like a browser would. */
const browserClient = async (email, password = 'testpass12345') => {
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  assert.equal(error, null);
  return client;
};

describe('customers cannot write orders directly', () => {
  // The public key ships in the frontend, so anything RLS allows a customer is
  // allowed to anyone who logs in. Used to include INSERT/UPDATE on orders.
  it('refuses to create an order (e.g. a free one)', async () => {
    const client = await browserClient('customer@3k.local');
    const userId = await userIdFor('customer');
    const { error } = await client.from('orders').insert({
      customer_id: userId,
      channel: 'online',
      fulfillment_type: 'pickup',
      total_amount: 0,
    });
    assert.ok(error, 'insert must be rejected');
  });

  it('refuses to mark their own order paid or change its total', async () => {
    const order = await placeOnlineOrder('customer');
    const client = await browserClient('customer@3k.local');

    const { data } = await client
      .from('orders')
      .update({ payment_status: 'paid', status: 'completed', total_amount: 0 })
      .eq('id', order.id)
      .select();
    assert.deepEqual(data ?? [], []);

    const row = await orderRow(order.id, 'payment_status, status, total_amount');
    assert.equal(row.payment_status, 'unpaid');
    assert.equal(row.status, 'pending');
    assert.ok(Number(row.total_amount) > 0);
  });

  it('refuses to add an item with a price they choose', async () => {
    const order = await placeOnlineOrder('customer');
    const client = await browserClient('customer@3k.local');
    const { error } = await client
      .from('order_items')
      .insert({ order_id: order.id, product_id: flat.id, quantity: 1, unit_price: 0 });
    assert.ok(error);
  });

  it('can still read their own orders', async () => {
    const order = await placeOnlineOrder('customer');
    const client = await browserClient('customer@3k.local');
    const { data } = await client.from('orders').select('id').eq('id', order.id);
    assert.equal(data.length, 1);
  });
});

describe('POST /orders/:id/cancel', () => {
  it('cancels the customer’s own pending order through the API', async () => {
    const order = await placeOnlineOrder('customer');
    const res = await post(`/orders/${order.id}/cancel`, undefined, { token: customer });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'cancelled');
  });

  it('will not cancel someone else’s order', async () => {
    const order = await placeOnlineOrder('customer');
    const res = await post(`/orders/${order.id}/cancel`, undefined, { token: customer2 });

    assert.equal(res.status, 409);
    assert.equal((await orderRow(order.id, 'status')).status, 'pending');
  });

  it('lets the customer cancel after a failed GCash attempt', async () => {
    const order = await placeOnlineOrder('customer');
    await setOrderState(order.id, { payment_status: 'failed', payment_method: 'gcash' });

    const res = await post(`/orders/${order.id}/cancel`, undefined, { token: customer });
    assert.equal(res.status, 200);
  });

  it('will not cancel an order that is paid or being paid', async () => {
    for (const payment_status of ['paid', 'processing']) {
      const order = await placeOnlineOrder('customer');
      await setOrderState(order.id, { payment_status });
      const res = await post(`/orders/${order.id}/cancel`, undefined, { token: customer });
      assert.equal(res.status, 409, payment_status);
    }
  });
});

describe('order numbers', () => {
  const insertOrder = (fields) =>
    db
      .from('orders')
      .insert({ branch_id: gma, channel: 'pos', fulfillment_type: 'take_out', customer_name: 'Number Test', total_amount: 1, ...fields })
      .select('id, order_number, created_at')
      .single();

  it('may repeat on different days (the counter restarts daily)', async () => {
    const today = await insertOrder({ order_number: 'T-9001' });
    track(today.data.id);
    const yesterday = await insertOrder({
      order_number: 'T-9001',
      created_at: new Date(Date.now() - 36 * 3600_000).toISOString(),
    });

    assert.equal(yesterday.error, null, 'the same number on another day must not collide');
    track(yesterday.data.id);
  });

  it('is still unique within one day', async () => {
    const first = await insertOrder({ order_number: 'T-9002' });
    track(first.data.id);
    const second = await insertOrder({ order_number: 'T-9002' });

    assert.equal(second.error?.code, '23505');
  });

  it('counts per branch: two branches may issue the same number on the same day', async () => {
    const here = await insertOrder({ order_number: 'T-9003' });
    track(here.data.id);
    const there = await insertOrder({ order_number: 'T-9003', branch_id: await branchId('imus') });

    assert.equal(there.error, null);
    track(there.data.id);
  });
});

describe('order search', () => {
  it('finds a name containing a comma, parentheses or quotes instead of failing', async () => {
    const names = [`Cruz, Juan ${Date.now()}`, `Juan (Jr) ${Date.now()}`, `Ann "Annie" ${Date.now()}`];
    for (const name of names) {
      const order = await placeWalkInOrder({ customer_name: name });
      const res = await get(`/pos/orders?q=${encodeURIComponent(name)}`, { token: cashier });

      assert.equal(res.status, 200, name);
      assert.ok(res.body.data.some((o) => o.id === order.id), `finds ${name}`);
    }
  });

  it('treats % and _ as plain characters, not wildcards', async () => {
    const stamp = Date.now();
    const target = await placeWalkInOrder({ customer_name: `Sale 100% ${stamp}` });
    await placeWalkInOrder({ customer_name: `Sale 1000 ${stamp}` });

    const res = await get(`/pos/orders?q=${encodeURIComponent(`100% ${stamp}`)}`, { token: cashier });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.map((o) => o.id), [target.id]);
  });

  it('does not let a crafted search add its own filter conditions', async () => {
    const res = await get(`/pos/orders?q=${encodeURIComponent('zzz%,status.eq.pending')}`, { token: cashier });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 0);
  });
});

describe('paying', () => {
  it('records a cash payment once even when two requests arrive together', async () => {
    const order = await placeWalkInOrder();
    const pay = () =>
      post(`/pos/orders/${order.id}/payment/cash`, { tendered_amount: Number(order.total_amount) }, { token: cashier });

    const results = await Promise.all([pay(), pay(), pay()]);
    const statuses = results.map((r) => r.status).sort();

    assert.equal(statuses.filter((s) => s === 200).length, 1, `got ${statuses}`);
    assert.ok(statuses.every((s) => s === 200 || s === 409));
    assert.equal((await paymentsFor(order.id)).filter((p) => p.provider === 'cash').length, 1);
  });

  it('keeps who took the money and the amount handed over', async () => {
    const order = await placeWalkInOrder();
    const tendered = Number(order.total_amount) + 50;
    await post(`/pos/orders/${order.id}/payment/cash`, { tendered_amount: tendered }, { token: cashier });

    const [payment] = await paymentsFor(order.id);
    assert.equal(payment.raw.tendered, tendered);
    assert.equal(payment.raw.change, 50);
    assert.ok(payment.raw.collected_by);
  });

  it('refuses amounts with more than two decimals or absurd sizes', async () => {
    const order = await placeWalkInOrder();
    for (const tendered_amount of [100.123, 1e9, -5]) {
      const res = await post(`/pos/orders/${order.id}/payment/cash`, { tendered_amount }, { token: cashier });
      assert.equal(res.status, 400, String(tendered_amount));
    }
  });

  it('will not let an order be edited once its payment has started', async () => {
    const order = await placeWalkInOrder();
    await setOrderState(order.id, { payment_status: 'processing', payment_method: 'gcash' });

    const res = await patch(
      `/pos/orders/${order.id}/items`,
      { items: [{ product_id: flat.id, quantity: 3 }] },
      { token: cashier },
    );
    assert.equal(res.status, 409);
    assert.match(res.body.error.message, /payment/i);
  });

  it('still edits an unpaid order', async () => {
    const order = await placeWalkInOrder();
    const res = await patch(
      `/pos/orders/${order.id}/items`,
      { items: [{ product_id: flat.id, quantity: 2 }] },
      { token: cashier },
    );
    assert.equal(res.status, 200);
  });
});

describe('editing products that have been ordered', () => {
  let product;
  const sizes = [
    { label: 'Small', price: 100, sort_order: 0 },
    { label: 'Large', price: 200, sort_order: 1 },
  ];

  before(async () => {
    const created = await post(
      '/products',
      { name: `Variant test ${Date.now()}`, variants: sizes },
      { token: admin },
    );
    assert.equal(created.status, 201);
    product = created.body.data;

    // An order for the Small size gives that option order history.
    const small = product.variants.find((v) => v.label === 'Small');
    const placed = await post(
      '/pos/orders',
      {
        fulfillment_type: 'take_out',
        customer_name: 'Variant History',
        payment_method: 'cash',
        items: [{ product_id: product.id, variant_id: small.id, quantity: 1 }],
      },
      { token: cashier },
    );
    assert.equal(placed.status, 201);
    track(placed.body.data.id);
  });

  after(async () => {
    await cleanup();
    await db.from('products').delete().eq('id', product.id);
  });

  it('changes the price of an option that has orders (used to fail on the foreign key)', async () => {
    const res = await patch(
      `/products/${product.id}`,
      { variants: [{ label: 'Small', price: 110 }, { label: 'Large', price: 200 }] },
      { token: admin },
    );

    assert.equal(res.status, 200);
    const small = res.body.data.variants.find((v) => v.label === 'Small');
    assert.equal(Number(small.price), 110);
  });

  it('keeps the same option ids, so past orders still point at them', async () => {
    const before = (await get(`/products/${product.id}`)).body.data.variants.map((v) => v.id).sort();
    await patch(
      `/products/${product.id}`,
      { variants: [{ label: 'Small', price: 120 }, { label: 'Large', price: 210 }] },
      { token: admin },
    );
    const after = (await get(`/products/${product.id}`)).body.data.variants.map((v) => v.id).sort();
    assert.deepEqual(after, before);
  });

  it('adds a new option and removes an unused one', async () => {
    const res = await patch(
      `/products/${product.id}`,
      { variants: [{ label: 'Small', price: 120 }, { label: 'Huge', price: 300 }] },
      { token: admin },
    );
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.variants.map((v) => v.label).sort(), ['Huge', 'Small']);
  });

  it('explains why an option with orders cannot be removed, changing nothing', async () => {
    const res = await patch(
      `/products/${product.id}`,
      { name: 'Renamed anyway', variants: [{ label: 'Huge', price: 300 }] },
      { token: admin },
    );

    assert.equal(res.status, 409);
    assert.match(res.body.error.message, /Small/);
    const now = (await get(`/products/${product.id}`)).body.data;
    assert.ok(now.variants.some((v) => v.label === 'Small'), 'Small is still there');
  });

  it('explains why a product with orders cannot be deleted', async () => {
    const res = await del(`/products/${product.id}`, { token: admin });

    assert.equal(res.status, 409);
    assert.match(res.body.error.message, /sold out/i);
  });
});

describe('deactivated riders', () => {
  let riderId;

  before(async () => {
    riderId = await userIdFor('rider');
  });

  after(async () => {
    await db.from('profiles').update({ is_active: true }).eq('id', riderId);
  });

  it('are locked out of the rider routes even with a valid session', async () => {
    assert.equal((await get('/rider/pool', { token: rider })).status, 200);

    await db.from('profiles').update({ is_active: false }).eq('id', riderId);
    const blocked = await get('/rider/pool', { token: rider });
    assert.equal(blocked.status, 403);
    assert.match(blocked.body.error.message, /deactivated/i);

    await db.from('profiles').update({ is_active: true }).eq('id', riderId);
    assert.equal((await get('/rider/pool', { token: rider })).status, 200);
  });
});

describe('phone numbers and field limits through the API', () => {
  const base = { fulfillment_type: 'pickup', payment_method: 'cash', items: [{ product_id: null, quantity: 1 }] };
  const order = async (extra) =>
    post(
      '/orders',
      { ...base, branch_id: gma, ...(await orderTime(gma)), items: [{ product_id: flat.id, quantity: 1 }], ...extra },
      { token: customer },
    );

  it('requires exactly 11 digits starting 09', async () => {
    for (const bad of ['0917123456', '091712345678', '19171234567', '0917-123-4567', '+639171234567']) {
      const res = await order({ customer_phone: bad });
      assert.equal(res.status, 400, bad);
    }
    const ok = await order({ customer_phone: '09171234567' });
    assert.equal(ok.status, 201);
    track(ok.body.data.id);
  });

  it('needs a phone number for delivery', async () => {
    const res = await order({
      fulfillment_type: 'delivery',
      delivery_address: { line1: '1 Test St', city: 'Davao City' },
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.details.customer_phone);
  });

  it('stores the map pin with a delivery address', async () => {
    const res = await order({
      fulfillment_type: 'delivery',
      customer_phone: '09171234567',
      delivery_address: { line1: '1 Test St', city: 'GMA', latitude: 14.2985, longitude: 120.997 },
    });
    assert.equal(res.status, 201);
    track(res.body.data.id);
    assert.equal(res.body.data.delivery_address.latitude, 14.2985);
  });

  it('rejects a pin with only one coordinate, or outside the Philippines', async () => {
    const address = { line1: '1 Test St', city: 'GMA' };
    for (const pin of [{ latitude: 14.3 }, { latitude: 40.7, longitude: -74 }]) {
      const res = await order({
        fulfillment_type: 'delivery',
        customer_phone: '09171234567',
        delivery_address: { ...address, ...pin },
      });
      assert.equal(res.status, 400, JSON.stringify(pin));
    }
  });

  it('rejects whitespace-only names and over-long notes', async () => {
    const kiosk = await post(
      '/pos/orders',
      { fulfillment_type: 'take_out', customer_name: '   ', payment_method: 'cash', items: [{ product_id: flat.id, quantity: 1 }] },
      { token: cashier },
    );
    assert.equal(kiosk.status, 400);
    assert.equal((await order({ notes: 'x'.repeat(1001) })).status, 400);
  });

  it('caps quantity per line and distinct items per order', async () => {
    assert.equal((await order({ items: [{ product_id: flat.id, quantity: 100 }] })).status, 400);
    const products = await allProducts();
    const many = products.slice(0, 51).map((p) => ({ product_id: p.id, quantity: 1 }));
    assert.equal((await order({ items: many })).status, 400);
  });

  it('applies the same phone rule to riders created by an admin', async () => {
    const res = await post(
      '/admin/riders',
      { branch_id: gma, email: `bad-phone-${Date.now()}@3k.local`, password: 'password123', full_name: 'Bad Phone', phone: '12345' },
      { token: admin },
    );
    assert.equal(res.status, 400);
  });
});

describe('database limits (the rules hold even for scripts)', () => {
  it('rejects a malformed phone number', async () => {
    const { error } = await db
      .from('orders')
      .insert({ branch_id: gma, channel: 'pos', fulfillment_type: 'take_out', customer_name: 'X', customer_phone: '123' });
    assert.equal(error?.code, '23514');
  });

  it('rejects a delivery pin with one coordinate', async () => {
    const { data, error } = await db
      .from('orders')
      .insert({
        branch_id: gma,
        channel: 'online',
        fulfillment_type: 'delivery',
        customer_name: 'Pin Test',
        delivery_address: { line1: 'a', city: 'b', latitude: 14.3 },
      })
      .select('id')
      .maybeSingle();
    // Never leave a row behind, even if the constraint is missing and this fails.
    if (data?.id) track(data.id);
    assert.equal(error?.code, '23514');
  });

  it('accepts a complete, valid pin and rejects an impossible one', async () => {
    const insert = (pin) =>
      db
        .from('orders')
        .insert({
          branch_id: gma,
          channel: 'online',
          fulfillment_type: 'delivery',
          customer_name: 'Pin Test',
          delivery_address: { line1: 'a', city: 'b', ...pin },
        })
        .select('id')
        .maybeSingle();

    const good = await insert({ latitude: 14.3, longitude: 121 });
    if (good.data?.id) track(good.data.id);
    assert.equal(good.error, null);

    const bad = await insert({ latitude: 140, longitude: 121 });
    if (bad.data?.id) track(bad.data.id);
    assert.equal(bad.error?.code, '23514');
  });

  it('rejects a quantity above 99', async () => {
    const order = await placeWalkInOrder();
    const { error } = await db
      .from('order_items')
      .insert({ order_id: order.id, product_id: flat.id, quantity: 100, unit_price: 1 });
    assert.equal(error?.code, '23514');
  });

  it('allows only one cash payment per order', async () => {
    const order = await placeWalkInOrder();
    const row = { order_id: order.id, provider: 'cash', amount_centavos: 100, status: 'paid' };
    assert.equal((await db.from('payments').insert(row)).error, null);
    assert.equal((await db.from('payments').insert(row)).error?.code, '23505');
  });
});
