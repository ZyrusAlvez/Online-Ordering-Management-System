import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { get, post } from '../helpers/client.js';
import { tokenFor } from '../helpers/auth.js';
import { orderRow, setOrderState } from '../helpers/db.js';
import { cleanup, placeWalkInOrder } from '../helpers/fixtures.js';

/**
 * JOURNEY: things go wrong at the counter.
 *
 *   walk-in order → paid in cash → voided with a reason and an author
 *   and: a GCash-paid order cannot be voided without a working refund path.
 */
describe('E2E: voiding orders', () => {
  let cashier;
  let admin;

  before(async () => {
    cashier = await tokenFor('cashier');
    admin = await tokenFor('admin');
  });

  after(cleanup);

  it('voids an unpaid order that the customer abandoned', async () => {
    const order = await placeWalkInOrder({ customer_name: 'Abandoned' });

    const res = await post(
      `/pos/orders/${order.id}/void`,
      { reason: 'customer left without paying' },
      { token: cashier },
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'voided');
    assert.equal(res.body.meta.refund_id, null);
  });

  it('records who voided it and why, for the audit trail', async () => {
    const order = await placeWalkInOrder();
    await post(`/pos/orders/${order.id}/void`, { reason: 'wrong item rung up' }, { token: cashier });

    const row = await orderRow(order.id, 'void_reason, voided_by, voided_at');
    assert.equal(row.void_reason, 'wrong item rung up');
    assert.ok(row.voided_by);
    assert.ok(row.voided_at);
  });

  it('voids a cash-paid order — the drawer is refunded by hand', async () => {
    const order = await placeWalkInOrder();
    await post(`/pos/orders/${order.id}/payment/cash`, {}, { token: cashier });

    const res = await post(
      `/pos/orders/${order.id}/void`,
      { reason: 'kitchen error' },
      { token: cashier },
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'voided');
    assert.equal(res.body.meta.refund_id, null, 'no provider refund for cash');
  });

  it('refuses to void a GCash-paid order when refunds are unavailable', async (t) => {
    const order = await placeWalkInOrder();
    await setOrderState(order.id, { payment_status: 'paid', payment_method: 'gcash' });

    const res = await post(
      `/pos/orders/${order.id}/void`,
      { reason: 'customer complaint' },
      { token: cashier },
    );

    if (res.status === 200) {
      return t.skip('PayMongo is configured; the refund path was exercised instead');
    }

    // 503: refunds need PayMongo. The important part is that the order was NOT
    // voided, which would have kept the customer's money.
    assert.equal(res.status, 503);
    const row = await orderRow(order.id, 'status, payment_status');
    assert.notEqual(row.status, 'voided', 'must not void while the refund cannot be issued');
    assert.equal(row.payment_status, 'paid');
  });

  it('a voided order stays out of the working queue', async () => {
    const order = await placeWalkInOrder();
    await post(`/pos/orders/${order.id}/void`, { reason: 'test' }, { token: cashier });

    const res = await get('/pos/orders?status=pending&limit=100', { token: cashier });
    assert.equal(res.body.data.some((o) => o.id === order.id), false);
  });

  it('an admin sees voided orders when reviewing the day', async () => {
    const order = await placeWalkInOrder();
    await post(`/pos/orders/${order.id}/void`, { reason: 'test' }, { token: cashier });

    const res = await get('/admin/orders?status=voided&limit=100', { token: admin });
    assert.ok(res.body.data.some((o) => o.id === order.id));
  });
});
