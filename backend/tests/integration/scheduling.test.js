import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { get, post } from '../helpers/client.js';
import { tokenFor } from '../helpers/auth.js';
import { db } from '../helpers/db.js';
import { cleanup, flatPricedProduct, track } from '../helpers/fixtures.js';
import { manilaMinutes, nextOpenSlot } from '../../src/utils/schedule.js';

/**
 * Two throwaway branches: one open around the clock, and one open for a single
 * hour that starts a couple of hours from now, so it is closed right now
 * whatever time the suite runs.
 */
let customer;
let superAdmin;
let flat;
let always;
let window;
const branches = [];

const hhmm = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const QUARTER = 15 * 60_000;
const quarter = (ms) => Math.ceil(ms / QUARTER) * QUARTER;

const makeBranch = async (name, hours) => {
  const stamp = `${Date.now().toString(36)}${branches.length}`;
  const { data, error } = await db
    .from('branches')
    .insert({ name: `${name} ${stamp}`, code: `sched-${stamp}`, latitude: 14.3, longitude: 120.95, ...hours })
    .select('id, name, opens_at, closes_at')
    .single();
  assert.equal(error, null, error?.message);
  branches.push(data.id);
  return data;
};

const order = (branch, extra = {}) =>
  post(
    '/orders',
    {
      branch_id: branch.id,
      fulfillment_type: 'pickup',
      payment_method: 'cash',
      items: [{ product_id: flat.id, quantity: 1 }],
      ...extra,
    },
    { token: customer },
  );

before(async () => {
  [customer, superAdmin] = await Promise.all([tokenFor('customer'), tokenFor('admin')]);
  flat = await flatPricedProduct();

  always = await makeBranch('Always Open', { opens_at: null, closes_at: null });
  const now = manilaMinutes(new Date());
  // An hour-long window starting about two hours from now; late at night, an
  // hour in the small hours of tomorrow instead (it must not cross midnight).
  const start = now + 180 < 24 * 60 ? Math.ceil((now + 120) / 15) * 15 : 60;
  window = await makeBranch('One Hour', { opens_at: hhmm(start), closes_at: hhmm(start + 60) });
});

after(async () => {
  await cleanup();
  if (branches.length) await db.from('branches').delete().in('id', branches);
});

describe('scheduled online orders', () => {
  it('takes an ASAP order while the branch is open', async () => {
    const res = await order(always);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    track(res.body.data.id);
    assert.equal(res.body.data.scheduled_for, null);
  });

  it('refuses ASAP while the branch is closed, asking for a time instead', async () => {
    const res = await order(window);
    assert.equal(res.status, 409);
    assert.ok(res.body.error.details.scheduled_for);
  });

  it('takes a slot inside the opening hours and shows it to the counter', async () => {
    const slot = nextOpenSlot(window);
    const res = await order(window, { scheduled_for: slot });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    track(res.body.data.id);
    assert.equal(new Date(res.body.data.scheduled_for).toISOString(), slot);

    const queue = await get(`/pos/orders?branch_id=${window.id}`, { token: superAdmin });
    const listed = queue.body.data.find((o) => o.id === res.body.data.id);
    assert.equal(new Date(listed.scheduled_for).toISOString(), slot);
  });

  it('refuses a slot outside the hours, off the quarter hour, too soon or too far ahead', async () => {
    const opening = new Date(nextOpenSlot(window)).getTime();
    const bad = [
      [window, new Date(opening - 2 * 3600_000).toISOString(), 'before opening'],
      [always, new Date(quarter(Date.now() + 3600_000) + 5 * 60_000).toISOString(), 'not on a quarter hour'],
      [always, new Date(quarter(Date.now())).toISOString(), 'less than 30 minutes ahead'],
      [always, new Date(quarter(Date.now() + 4 * 86_400_000)).toISOString(), 'four days ahead'],
    ];
    for (const [branch, slot, why] of bad) {
      const res = await order(branch, { scheduled_for: slot });
      assert.equal(res.status, 400, why);
    }
    assert.equal((await order(always, { scheduled_for: 'tomorrow noon' })).status, 400);
  });

  it('is only for online orders, even for a script', async () => {
    const { data, error } = await db
      .from('orders')
      .insert({
        branch_id: always.id,
        channel: 'pos',
        fulfillment_type: 'take_out',
        customer_name: 'Schedule Test',
        scheduled_for: new Date(Date.now() + 3600_000).toISOString(),
      })
      .select('id')
      .maybeSingle();
    if (data?.id) track(data.id);
    assert.equal(error?.code, '23514');
  });
});
