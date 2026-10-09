import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { get } from '../helpers/client.js';
import { tokenFor } from '../helpers/auth.js';
import { db } from '../helpers/db.js';
import { allProducts, branchId, cleanup, flatPricedProduct, track, variantPricedProduct } from '../helpers/fixtures.js';
import { manilaToday } from '../../src/utils/manilaDate.js';

/**
 * The shared database also holds real orders, so every figure here is asserted
 * against a day in 2001, where nothing else exists. Orders are inserted directly in
 * exactly the state under test (the report only reads orders and their items).
 */

const DAY = '2001-03-15'; // the day all the assertions are about
const at = (day, time = '12:00:00') => `${day}T${time}+08:00`; // Manila time

let admin;
let p1; // a flat-priced dish
let p2; // a different flat-priced dish
let variantProduct;
let variant;

before(async () => {
  admin = await tokenFor('admin');
  p1 = await flatPricedProduct();
  p2 = (await allProducts()).find((p) => p.price != null && p.variants.length === 0 && p.id !== p1.id);
  variantProduct = await variantPricedProduct();
  variant = variantProduct.variants.find((v) => v.price != null);
});

after(cleanup);

/** Inserts an order (and its lines) in an exact state, dated in Manila time. */
const makeOrder = async ({
  channel = 'pos',
  fulfillment = channel === 'online' ? 'delivery' : 'take_out',
  status = 'completed',
  payment_status = 'paid',
  payment_method = 'cash',
  total,
  created = at(DAY),
  lines = [],
  branch = 'gma',
}) => {
  const { data, error } = await db
    .from('orders')
    .insert({
      branch_id: await branchId(branch),
      channel,
      fulfillment_type: fulfillment,
      customer_name: 'Sales Test',
      status,
      payment_status,
      payment_method,
      total_amount: total,
      created_at: created,
    })
    .select('id')
    .single();
  assert.equal(error, null, error?.message);
  track(data.id);

  if (lines.length) {
    const { error: itemError } = await db
      .from('order_items')
      .insert(lines.map((l) => ({ order_id: data.id, product_id: l.product.id, variant_id: l.variant?.id ?? null, quantity: l.qty, unit_price: l.price })));
    assert.equal(itemError, null, itemError?.message);
  }
  return data.id;
};

const report = async (from, to = from) => {
  const res = await get(`/admin/sales?from=${from}&to=${to}`, { token: admin });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data;
};

describe('GET /admin/sales', () => {
  before(async () => {
    // ---- orders that COUNT as sales on DAY ----
    // counter cash, paid at the till while the kitchen is still working on it
    await makeOrder({ channel: 'pos', status: 'pending', payment_method: 'cash', total: 200, lines: [{ product: p1, qty: 2, price: 100 }] });
    // kiosk GCash: paid and sent to the kitchen, not completed
    await makeOrder({ channel: 'kiosk', fulfillment: 'dine_in', status: 'confirmed', payment_method: 'gcash', total: 150, lines: [{ product: p2, qty: 1, price: 150 }] });
    // online cash on delivery, completed
    await makeOrder({ channel: 'online', status: 'completed', payment_method: 'cash', total: 300, lines: [{ product: p1, qty: 3, price: 100 }] });
    // an order with a size option
    await makeOrder({ channel: 'pos', status: 'ready', payment_method: 'cash', total: Number(variant.price), lines: [{ product: variantProduct, variant, qty: 1, price: Number(variant.price) }] });
    // last millisecond of the day in Manila
    await makeOrder({ channel: 'pos', payment_method: 'cash', total: 50, created: at(DAY, '23:59:59.999') });

    // ---- orders that must NOT count ----
    await makeOrder({ status: 'voided', payment_status: 'paid', total: 999 }); // voided cash order
    await makeOrder({ status: 'voided', payment_status: 'refunded', payment_method: 'gcash', total: 999 });
    await makeOrder({ status: 'cancelled', payment_status: 'paid', total: 999 });
    await makeOrder({ status: 'cancelled', payment_status: 'unpaid', total: 999 });
    await makeOrder({ status: 'pending', payment_status: 'unpaid', total: 999 });
    await makeOrder({ status: 'pending', payment_status: 'processing', payment_method: 'gcash', total: 999 });
    await makeOrder({ status: 'completed', payment_status: 'failed', payment_method: 'gcash', total: 999 });

    // ---- voided and still waiting on a refund: reported separately, never as revenue ----
    await makeOrder({ status: 'voided', payment_status: 'refund_pending', payment_method: 'gcash', total: 120 });
    await makeOrder({ status: 'voided', payment_status: 'refund_failed', payment_method: 'gcash', total: 80 });

    // ---- the neighbouring Manila days ----
    await makeOrder({ total: 70, created: at('2001-03-14', '23:59:59') }); // one second before DAY
    await makeOrder({ total: 60, created: at('2001-03-16', '00:00:00') }); // exactly the start of the next day
  });

  const variantPrice = () => Number(variant.price);
  const expectedRevenue = () => 200 + 150 + 300 + variantPrice() + 50;

  it('counts paid, live orders and nothing else', async () => {
    const r = await report(DAY);

    assert.equal(r.totals.orders, 5);
    assert.equal(r.totals.revenue, expectedRevenue());
    assert.equal(r.totals.average_order, Math.round((expectedRevenue() / 5) * 100) / 100);
  });

  it('counts an order when it is paid, not when it is completed', async () => {
    const r = await report(DAY);
    // The counter order is still `pending` and the kiosk GCash order only `confirmed`, yet both are in.
    assert.ok(r.totals.revenue >= 350);
    const channels = Object.fromEntries(r.by_channel.map((c) => [c.channel, c]));
    assert.equal(channels.kiosk.revenue, 150);
  });

  it('adds up the items sold, including a size option', async () => {
    const r = await report(DAY);
    assert.equal(r.totals.items_sold, 2 + 1 + 3 + 1);
  });

  it('splits revenue by payment method', async () => {
    const r = await report(DAY);
    const methods = Object.fromEntries(r.by_method.map((m) => [m.method, m]));

    assert.equal(methods.cash.orders, 4);
    assert.equal(methods.cash.revenue, 200 + 300 + variantPrice() + 50);
    assert.equal(methods.gcash.orders, 1);
    assert.equal(methods.gcash.revenue, 150);
    assert.equal(r.by_method.length, 2);
  });

  it('splits revenue by channel, biggest first', async () => {
    const r = await report(DAY);
    const channels = Object.fromEntries(r.by_channel.map((c) => [c.channel, c]));

    assert.equal(channels.online.revenue, 300);
    assert.equal(channels.kiosk.revenue, 150);
    assert.equal(channels.pos.revenue, 200 + variantPrice() + 50);
    assert.equal(channels.pos.orders, 3);
    const revenues = r.by_channel.map((c) => c.revenue);
    assert.deepEqual(revenues, [...revenues].sort((a, b) => b - a));
  });

  it('ranks best sellers by quantity, with the size option named', async () => {
    const r = await report(DAY);
    const [first, ...rest] = r.top_items;

    assert.equal(first.name, p1.name);
    assert.equal(first.quantity, 5);
    assert.equal(first.revenue, 500);
    assert.equal(first.variant, null);

    const sized = rest.find((i) => i.name === variantProduct.name);
    assert.equal(sized.variant, variant.label);
    assert.equal(sized.quantity, 1);
    assert.equal(sized.revenue, variantPrice());

    assert.ok(rest.find((i) => i.name === p2.name && i.quantity === 1 && i.revenue === 150));
    const quantities = r.top_items.map((i) => i.quantity);
    assert.deepEqual(quantities, [...quantities].sort((a, b) => b - a));
  });

  it('reports voided orders waiting on a refund separately', async () => {
    const r = await report(DAY);
    assert.deepEqual(r.refunds_pending, { orders: 2, amount: 200 });
  });

  it('puts each order on its Manila day, with the boundary exactly at midnight', async () => {
    const r = await report('2001-03-14', '2001-03-16');

    assert.deepEqual(r.daily.map((d) => d.date), ['2001-03-14', '2001-03-15', '2001-03-16']);
    assert.deepEqual(r.daily.map((d) => d.orders), [1, 5, 1]);
    assert.deepEqual(r.daily.map((d) => d.revenue), [70, expectedRevenue(), 60]);
    assert.equal(r.totals.revenue, 70 + expectedRevenue() + 60);
  });

  it('includes quiet days as zeros so a chart has no gaps', async () => {
    const r = await report('2001-03-12', '2001-03-18');

    assert.equal(r.daily.length, 7);
    assert.deepEqual(r.daily.filter((d) => d.orders === 0).map((d) => d.date), [
      '2001-03-12', '2001-03-13', '2001-03-17', '2001-03-18',
    ]);
  });

  it('returns zeros and empty lists for a day with no sales', async () => {
    const r = await report('2001-03-20');

    assert.deepEqual(r.totals, { orders: 0, revenue: 0, average_order: 0, items_sold: 0 });
    assert.deepEqual(r.by_method, []);
    assert.deepEqual(r.by_channel, []);
    assert.deepEqual(r.top_items, []);
    assert.deepEqual(r.refunds_pending, { orders: 0, amount: 0 });
    assert.equal(r.daily.length, 1);
  });

  it('echoes the range it used', async () => {
    assert.deepEqual((await report('2001-03-14', '2001-03-16')).range, { from: '2001-03-14', to: '2001-03-16' });
  });
});

describe('GET /admin/sales ranges', () => {
  it('defaults to the last 7 days ending today in Manila', async () => {
    const res = await get('/admin/sales', { token: admin });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.range.to, manilaToday());
    assert.equal(res.body.data.daily.length, 7);
    assert.equal(res.body.data.daily.at(-1).date, manilaToday());
  });

  it('accepts a year but not a year and a day', async () => {
    assert.equal((await get('/admin/sales?from=2025-01-01&to=2026-01-01', { token: admin })).status, 200);
    assert.equal((await get('/admin/sales?from=2025-01-01&to=2026-01-02', { token: admin })).status, 400);
  });

  it('rejects bad input', async () => {
    for (const q of ['from=2026-10-05&to=2026-10-04', 'from=2026-02-30', 'from=10/04/2026', 'to=soon']) {
      const res = await get(`/admin/sales?${q}`, { token: admin });
      assert.equal(res.status, 400, q);
    }
  });
});

describe('GET /admin/sales access', () => {
  it('is for admins only', async () => {
    assert.equal((await get('/admin/sales')).status, 401);
    for (const role of ['cashier', 'customer', 'rider']) {
      const res = await get('/admin/sales', { token: await tokenFor(role) });
      assert.equal(res.status, 403, role);
    }
  });

  it('cannot be run straight from a browser with a user token', async () => {
    // The SQL function is closed to the public keys; only the API's secret key may call it.
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const anon = await client.rpc('sales_report', { p_from: '2001-03-14T16:00:00Z', p_to: '2001-03-15T16:00:00Z' });
    assert.ok(anon.error, 'anonymous must be refused');

    await client.auth.signInWithPassword({ email: 'customer@3k.local', password: 'testpass12345' });
    const user = await client.rpc('sales_report', { p_from: '2001-03-14T16:00:00Z', p_to: '2001-03-15T16:00:00Z' });
    assert.ok(user.error, 'a signed-in customer must be refused');
  });
});
