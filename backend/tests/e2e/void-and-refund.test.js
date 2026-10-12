import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { get, post } from '../helpers/client.js';
import { tokenFor } from '../helpers/auth.js';
import { orderRow, paymentsFor, setOrderState } from '../helpers/db.js';
import { cleanup, placeWalkInOrder } from '../helpers/fixtures.js';

/**
 * JOURNEY: things go wrong at the counter.
 *
 *   walk-in order → paid in cash → voided with a reason and an author
 *   and: a GCash-paid order is voided into refund_pending; staff send the money
 *        back by hand and mark it refunded.
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
    assert.equal(res.body.meta.refund_pending, false);
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
    assert.equal(res.body.meta.refund_pending, false, 'cash is handed back from the drawer');
  });

  it('voids a GCash-paid order into refund_pending, then an admin marks it refunded', async () => {
    const order = await placeWalkInOrder();
    await post(
      `/pos/orders/${order.id}/payment/gcash`,
      { reference_number: '3012345678901' },
      { token: cashier },
    );

    const res = await post(
      `/pos/orders/${order.id}/void`,
      { reason: 'customer complaint' },
      { token: cashier },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'voided');
    assert.equal(res.body.data.payment_status, 'refund_pending');
    assert.equal(res.body.meta.refund_pending, true);

    const refunded = await post(`/admin/orders/${order.id}/refund`, undefined, { token: admin });
    assert.equal(refunded.status, 200);
    assert.equal(refunded.body.data.payment_status, 'refunded');

    const [payment] = await paymentsFor(order.id);
    assert.equal(payment.status, 'refunded');
    assert.ok(payment.raw.refunded_by);

    const again = await post(`/admin/orders/${order.id}/refund`, undefined, { token: admin });
    assert.equal(again.status, 409);
  });

  it('will not void while a GCash payment is waiting to be verified', async () => {
    const order = await placeWalkInOrder();
    await setOrderState(order.id, { payment_status: 'processing', payment_method: 'gcash' });

    const res = await post(`/pos/orders/${order.id}/void`, { reason: 'test' }, { token: cashier });
    assert.equal(res.status, 409);
    assert.match(res.body.error.message, /verify or reject/i);
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
