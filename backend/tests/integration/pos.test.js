import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { get, patch, post } from '../helpers/client.js';
import { tokenFor } from '../helpers/auth.js';
import { orderRow, paymentsFor, setOrderState } from '../helpers/db.js';
import {
  cleanup,
  cleanupKiosks,
  flatPricedProduct,
  issueKioskKey,
  placeKioskOrder,
  placeOnlineOrder,
  placeWalkInOrder,
} from '../helpers/fixtures.js';

let cashier;
let kioskKey;
let flat;

before(async () => {
  cashier = await tokenFor('cashier');
  kioskKey = await issueKioskKey('POS Test Kiosk');
  flat = await flatPricedProduct();
});

after(async () => {
  await cleanup();
  await cleanupKiosks();
});

describe('GET /pos/orders (the queue)', () => {
  it('lists orders with pagination meta', async () => {
    await placeWalkInOrder();
    const res = await get('/pos/orders?limit=5', { token: cashier });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.meta.total >= 1);
  });

  it('finds a kiosk order by the customer name', async () => {
    const unique = `Zelda${Date.now()}`;
    const { order } = await placeKioskOrder(kioskKey, { customer_name: unique });

    const res = await get(`/pos/orders?q=${unique}`, { token: cashier });
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].id, order.id);
  });

  it('finds an order by its order number', async () => {
    const { order } = await placeKioskOrder(kioskKey);
    const res = await get(`/pos/orders?q=${order.order_number}`, { token: cashier });

    assert.ok(res.body.data.some((o) => o.id === order.id));
  });

  it('filters by status', async () => {
    const res = await get('/pos/orders?status=pending', { token: cashier });
    assert.equal(res.status, 200);
    for (const order of res.body.data) assert.equal(order.status, 'pending');
  });

  it('filters by channel', async () => {
    await placeKioskOrder(kioskKey);
    const res = await get('/pos/orders?channel=kiosk', { token: cashier });
    for (const order of res.body.data) assert.equal(order.channel, 'kiosk');
  });

  it('filters by payment status', async () => {
    const res = await get('/pos/orders?payment_status=unpaid', { token: cashier });
    for (const order of res.body.data) assert.equal(order.payment_status, 'unpaid');
  });

  it('rejects an unknown status value', async () => {
    assert.equal((await get('/pos/orders?status=frozen', { token: cashier })).status, 400);
  });

  it('includes joined items, so the queue can render a ticket', async () => {
    await placeWalkInOrder();
    const res = await get('/pos/orders?limit=1', { token: cashier });
    assert.ok(Array.isArray(res.body.data[0].order_items));
  });
});

describe('POST /pos/orders (walk-in)', () => {
  it('creates a POS-channel order', async () => {
    const order = await placeWalkInOrder({ customer_name: 'Counter Guy' });
    assert.equal(order.channel, 'pos');
    assert.match(order.order_number, /^P-\d{4}$/);
    assert.equal(order.status, 'pending');
  });

  it('rejects a delivery from the counter', async () => {
    const res = await post(
      '/pos/orders',
      {
        fulfillment_type: 'delivery',
        customer_name: 'X',
        payment_method: 'cash',
        items: [{ product_id: flat.id, quantity: 1 }],
      },
      { token: cashier },
    );
    assert.equal(res.status, 400);
  });
});

describe('PATCH /pos/orders/:id/items', () => {
  it('replaces the items and recomputes the total', async () => {
    const order = await placeWalkInOrder();

    const res = await patch(
      `/pos/orders/${order.id}/items`,
      { items: [{ product_id: flat.id, quantity: 4 }] },
      { token: cashier },
    );

    assert.equal(res.status, 200);
    assert.equal(Number(res.body.data.total_amount), flat.price * 4);
    assert.equal(res.body.data.order_items.length, 1);
  });

  it('refuses once the order is out of the kitchen', async () => {
    const order = await placeWalkInOrder();
    await setOrderState(order.id, { status: 'ready' });

    const res = await patch(
      `/pos/orders/${order.id}/items`,
      { items: [{ product_id: flat.id, quantity: 1 }] },
      { token: cashier },
    );

    assert.equal(res.status, 409);
    assert.match(res.body.error.message, /Cannot modify/);
  });

  it('rejects an empty item list', async () => {
    const order = await placeWalkInOrder();
    const res = await patch(`/pos/orders/${order.id}/items`, { items: [] }, { token: cashier });
    assert.equal(res.status, 400);
  });
});

describe('order lifecycle', () => {
  it('confirms a pending order', async () => {
    const order = await placeWalkInOrder();
    const res = await post(`/pos/orders/${order.id}/confirm`, undefined, { token: cashier });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'confirmed');
  });

  it('rejects a second confirm rather than silently succeeding', async () => {
    const order = await placeWalkInOrder();
    await post(`/pos/orders/${order.id}/confirm`, undefined, { token: cashier });

    const res = await post(`/pos/orders/${order.id}/confirm`, undefined, { token: cashier });
    assert.equal(res.status, 409);
  });

  it('walks pending -> confirmed -> preparing -> ready -> completed', async () => {
    const order = await placeWalkInOrder();
    await post(`/pos/orders/${order.id}/confirm`, undefined, { token: cashier });

    for (const status of ['preparing', 'ready', 'completed']) {
      const res = await patch(`/pos/orders/${order.id}/status`, { status }, { token: cashier });
      assert.equal(res.status, 200, `advancing to ${status}`);
      assert.equal(res.body.data.status, status);
    }
  });

  it('refuses to skip a stage, naming the legal moves', async () => {
    const order = await placeWalkInOrder();
    const res = await patch(`/pos/orders/${order.id}/status`, { status: 'ready' }, { token: cashier });

    assert.equal(res.status, 409);
    assert.match(res.body.error.message, /Cannot move an order from pending to ready/);
    assert.match(res.body.error.message, /allowed: confirmed, preparing/);
  });

  it('refuses to move backwards', async () => {
    const order = await placeWalkInOrder();
    await post(`/pos/orders/${order.id}/confirm`, undefined, { token: cashier });
    await patch(`/pos/orders/${order.id}/status`, { status: 'ready' }, { token: cashier });

    const res = await patch(
      `/pos/orders/${order.id}/status`,
      { status: 'preparing' },
      { token: cashier },
    );
    assert.equal(res.status, 409);
  });

  it('refuses to advance a completed order', async () => {
    const order = await placeWalkInOrder();
    await setOrderState(order.id, { status: 'completed' });

    const res = await patch(
      `/pos/orders/${order.id}/status`,
      { status: 'ready' },
      { token: cashier },
    );
    assert.equal(res.status, 409);
  });

  it('rejects a status outside the vocabulary', async () => {
    const order = await placeWalkInOrder();
    const res = await patch(
      `/pos/orders/${order.id}/status`,
      { status: 'incinerated' },
      { token: cashier },
    );
    assert.equal(res.status, 400);
  });
});

describe('POST /pos/orders/:id/payment/cash', () => {
  it('marks the order paid and records a payment row', async () => {
    const order = await placeWalkInOrder();
    const res = await post(
      `/pos/orders/${order.id}/payment/cash`,
      { tendered_amount: flat.price },
      { token: cashier },
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.data.payment_status, 'paid');
    assert.equal(res.body.data.payment_method, 'cash');

    const payments = await paymentsFor(order.id);
    assert.equal(payments.length, 1);
    assert.equal(payments[0].status, 'paid');
    assert.equal(payments[0].amount_centavos, Math.round(flat.price * 100));
  });

  it('returns the change owed', async () => {
    const order = await placeWalkInOrder();
    const res = await post(
      `/pos/orders/${order.id}/payment/cash`,
      { tendered_amount: flat.price + 60 },
      { token: cashier },
    );

    assert.equal(res.body.meta.change, 60);
    assert.equal(res.body.meta.tendered, flat.price + 60);
  });

  it('allows exact payment, giving zero change', async () => {
    const order = await placeWalkInOrder();
    const res = await post(
      `/pos/orders/${order.id}/payment/cash`,
      { tendered_amount: flat.price },
      { token: cashier },
    );
    assert.equal(res.body.meta.change, 0);
  });

  it('allows settling without recording what was tendered', async () => {
    const order = await placeWalkInOrder();
    const res = await post(`/pos/orders/${order.id}/payment/cash`, {}, { token: cashier });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.payment_status, 'paid');
    assert.equal(res.body.meta.change, null);
  });

  it('rejects underpayment', async () => {
    const order = await placeWalkInOrder();
    const res = await post(
      `/pos/orders/${order.id}/payment/cash`,
      { tendered_amount: 1 },
      { token: cashier },
    );

    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /less than the total/);
  });

  it('refuses to charge twice', async () => {
    const order = await placeWalkInOrder();
    await post(`/pos/orders/${order.id}/payment/cash`, {}, { token: cashier });

    const res = await post(`/pos/orders/${order.id}/payment/cash`, {}, { token: cashier });
    assert.equal(res.status, 409);
    assert.match(res.body.error.message, /already paid/);
  });

  it('refuses payment on a voided order', async () => {
    const order = await placeWalkInOrder();
    await setOrderState(order.id, { status: 'voided' });

    const res = await post(`/pos/orders/${order.id}/payment/cash`, {}, { token: cashier });
    assert.equal(res.status, 409);
  });

  it('rejects a negative tendered amount', async () => {
    const order = await placeWalkInOrder();
    const res = await post(
      `/pos/orders/${order.id}/payment/cash`,
      { tendered_amount: -5 },
      { token: cashier },
    );
    assert.equal(res.status, 400);
  });
});

describe('POST /pos/orders/:id/void', () => {
  it('voids an unpaid order with a reason and an author', async () => {
    const order = await placeWalkInOrder();
    const res = await post(
      `/pos/orders/${order.id}/void`,
      { reason: 'customer left' },
      { token: cashier },
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'voided');
    assert.equal(res.body.data.void_reason, 'customer left');

    const row = await orderRow(order.id, 'voided_by, voided_at');
    assert.ok(row.voided_by, 'should record who voided it');
    assert.ok(row.voided_at);
  });

  it('requires a reason', async () => {
    const order = await placeWalkInOrder();
    const res = await post(`/pos/orders/${order.id}/void`, {}, { token: cashier });
    assert.equal(res.status, 400);
  });

  it('rejects an empty reason', async () => {
    const order = await placeWalkInOrder();
    const res = await post(`/pos/orders/${order.id}/void`, { reason: '' }, { token: cashier });
    assert.equal(res.status, 400);
  });

  it('refuses to void twice', async () => {
    const order = await placeWalkInOrder();
    await post(`/pos/orders/${order.id}/void`, { reason: 'first' }, { token: cashier });

    const res = await post(`/pos/orders/${order.id}/void`, { reason: 'again' }, { token: cashier });
    assert.equal(res.status, 409);
  });

  it('refuses to void a completed order', async () => {
    const order = await placeWalkInOrder();
    await setOrderState(order.id, { status: 'completed' });

    const res = await post(`/pos/orders/${order.id}/void`, { reason: 'too late' }, { token: cashier });
    assert.equal(res.status, 409);
  });

  it('voids a cash-paid order without needing a refund call', async () => {
    const order = await placeWalkInOrder();
    await post(`/pos/orders/${order.id}/payment/cash`, {}, { token: cashier });

    const res = await post(
      `/pos/orders/${order.id}/void`,
      { reason: 'wrong order' },
      { token: cashier },
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.meta.refund_pending, false, 'cash is refunded from the drawer');
  });
});

describe('POST /pos/orders/:id/payment/gcash (receipt shown at the counter)', () => {
  it('settles a kiosk GCash order with the reference number', async () => {
    const { order } = await placeKioskOrder(kioskKey, { payment_method: 'gcash' });
    const res = await post(
      `/pos/orders/${order.id}/payment/gcash`,
      { reference_number: '1012345678901' },
      { token: cashier },
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.data.payment_status, 'paid');
    assert.equal(res.body.data.payment_method, 'gcash');
    assert.equal(res.body.data.gcash_payment.reference_number, '1012345678901');

    const [payment] = await paymentsFor(order.id);
    assert.equal(payment.provider, 'gcash');
    assert.equal(payment.status, 'paid');
    assert.ok(payment.verified_by, 'records which cashier checked the receipt');
  });

  it('switches a cash walk-in to GCash', async () => {
    const order = await placeWalkInOrder();
    const res = await post(
      `/pos/orders/${order.id}/payment/gcash`,
      { reference_number: '1012345678902' },
      { token: cashier },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.data.payment_method, 'gcash');
  });

  it('needs a reference number', async () => {
    const order = await placeWalkInOrder();
    const res = await post(`/pos/orders/${order.id}/payment/gcash`, {}, { token: cashier });
    assert.equal(res.status, 400);
  });

  it('refuses an order that is already paid', async () => {
    const order = await placeWalkInOrder();
    await post(`/pos/orders/${order.id}/payment/cash`, {}, { token: cashier });
    const res = await post(
      `/pos/orders/${order.id}/payment/gcash`,
      { reference_number: '1012345678903' },
      { token: cashier },
    );
    assert.equal(res.status, 409);
  });
});

describe('POST /pos/orders/:id/payment/gcash/verify', () => {
  let customer;
  before(async () => {
    customer = await tokenFor('customer');
  });

  const submitted = async () => {
    const order = await placeOnlineOrder('customer', { payment_method: 'gcash' });
    const res = await post(
      `/orders/${order.id}/payment`,
      { reference_number: '2012345678901' },
      { token: customer },
    );
    assert.equal(res.status, 200);
    return order;
  };

  it('shows the cashier what the customer submitted', async () => {
    const order = await submitted();
    const res = await get(`/pos/orders/${order.id}`, { token: cashier });
    assert.equal(res.body.data.payment_status, 'processing');
    assert.equal(res.body.data.gcash_payment.reference_number, '2012345678901');
  });

  it('approves: the order is paid', async () => {
    const order = await submitted();
    const res = await post(
      `/pos/orders/${order.id}/payment/gcash/verify`,
      { approve: true },
      { token: cashier },
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.data.payment_status, 'paid');
    assert.equal(res.body.data.gcash_payment.status, 'paid');

    const again = await post(
      `/pos/orders/${order.id}/payment/gcash/verify`,
      { approve: true },
      { token: cashier },
    );
    assert.equal(again.status, 409, 'nothing left to verify');
  });

  it('rejects with a reason the customer sees, and lets them resubmit', async () => {
    const order = await submitted();
    const res = await post(
      `/pos/orders/${order.id}/payment/gcash/verify`,
      { approve: false, reason: 'No such reference in our GCash history' },
      { token: cashier },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.data.payment_status, 'failed');

    const mine = await get(`/orders/${order.id}`, { token: customer });
    assert.equal(mine.body.data.gcash_payment.failure_reason, 'No such reference in our GCash history');

    const resubmit = await post(
      `/orders/${order.id}/payment`,
      { reference_number: '2012345678999' },
      { token: customer },
    );
    assert.equal(resubmit.status, 200);
    assert.equal(resubmit.body.data.payment_status, 'processing');
    assert.equal((await paymentsFor(order.id)).length, 2, 'the rejected attempt is kept');
  });

  it('needs a reason to reject', async () => {
    const order = await submitted();
    const res = await post(
      `/pos/orders/${order.id}/payment/gcash/verify`,
      { approve: false },
      { token: cashier },
    );
    assert.equal(res.status, 400);
  });

  it('cash at the counter replaces a submission still waiting', async () => {
    const order = await submitted();
    const res = await post(`/pos/orders/${order.id}/payment/cash`, {}, { token: cashier });
    assert.equal(res.status, 200);

    const rows = await paymentsFor(order.id);
    const gcash = rows.find((p) => p.provider === 'gcash');
    assert.equal(gcash.status, 'failed', 'cannot be approved on top of the cash payment');
  });
});

describe('GET /pos/orders/:id', () => {
  it('returns a single order', async () => {
    const order = await placeWalkInOrder();
    const res = await get(`/pos/orders/${order.id}`, { token: cashier });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.id, order.id);
  });

  it('404s an unknown order', async () => {
    const res = await get('/pos/orders/00000000-0000-4000-8000-000000000000', { token: cashier });
    assert.equal(res.status, 404);
  });
});
