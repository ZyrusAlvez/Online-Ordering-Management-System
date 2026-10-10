import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { del, get, patch, post, put } from '../helpers/client.js';
import { tokenFor, userIdFor } from '../helpers/auth.js';
import { db } from '../helpers/db.js';
import {
  branchId,
  cleanup,
  cleanupKiosks,
  driveToReady,
  issueKioskKey,
  placeOnlineOrder,
  placeWalkInOrder,
  track,
} from '../helpers/fixtures.js';

/**
 * Branch isolation. The Imus admin, cashier and rider (seeded by
 * scripts/dev/seed-test-users.mjs) must never see or act on GMA Terminal, and
 * the GMA staff must never see Imus. The super admin (admin@3k.local) sees all.
 */

const ADDRESS = { line1: '1 Branch St', city: 'Imus' };

let superAdmin;
let imusAdmin;
let cashier; // GMA
let cashierImus;
let rider; // GMA
let riderImus;
let customer;
let gma;
let imus;
const createdUsers = [];
const createdThreads = [];

before(async () => {
  [superAdmin, imusAdmin, cashier, cashierImus, rider, riderImus, customer] = await Promise.all(
    ['admin', 'branchAdmin', 'cashier', 'cashierImus', 'rider', 'riderImus', 'customer'].map(tokenFor),
  );
  gma = await branchId('gma');
  imus = await branchId('imus');
});

after(async () => {
  await cleanup();
  await cleanupKiosks();
  if (createdThreads.length) await db.from('chat_threads').delete().in('id', createdThreads);
  for (const id of createdUsers) await db.auth.admin.deleteUser(id).catch(() => {});
});

describe('GET /branches', () => {
  it('lists the branches publicly with their location and hours', async () => {
    const res = await get('/branches');

    assert.equal(res.status, 200);
    const names = res.body.data.map((b) => b.name);
    for (const name of ['GMA Terminal', 'Dasma Bayan', 'Langkaan', 'Gen-Tri', 'Trece', 'Silang', 'Imus']) {
      assert.ok(names.includes(name), name);
    }
    const branch = res.body.data.find((b) => b.code === 'gma');
    assert.equal(typeof branch.latitude, 'number');
    assert.match(branch.opens_at ?? '', /^\d{2}:\d{2}$/);
  });
});

describe('a branch admin sees only their branches', () => {
  it('lists only their own orders', async () => {
    const atGma = await placeWalkInOrder();
    const atImus = await placeWalkInOrder({}, 'cashierImus');

    const res = await get('/admin/orders?limit=100', { token: imusAdmin });
    assert.equal(res.status, 200);
    const ids = res.body.data.map((o) => o.id);
    assert.ok(ids.includes(atImus.id));
    assert.ok(!ids.includes(atGma.id));
    for (const order of res.body.data) assert.equal(order.branch_id, imus);
  });

  it("403s asking for another branch's orders, sales, riders or kiosks", async () => {
    for (const path of ['/admin/orders', '/admin/sales', '/admin/riders', '/admin/kiosks']) {
      const res = await get(`${path}?branch_id=${gma}`, { token: imusAdmin });
      assert.equal(res.status, 403, path);
    }
  });

  it("404s retrying a refund on another branch's order", async () => {
    const atGma = await placeWalkInOrder();
    const res = await post(`/admin/orders/${atGma.id}/refund/retry`, undefined, { token: imusAdmin });
    assert.equal(res.status, 404);
  });

  it('counts only their branches in the sales report', async () => {
    const day = '2001-04-02';
    const insert = async (branch, total) => {
      const { data, error } = await db
        .from('orders')
        .insert({
          branch_id: branch,
          channel: 'pos',
          fulfillment_type: 'take_out',
          customer_name: 'Branch Sales',
          status: 'completed',
          payment_status: 'paid',
          payment_method: 'cash',
          total_amount: total,
          created_at: `${day}T12:00:00+08:00`,
        })
        .select('id')
        .single();
      assert.equal(error, null, error?.message);
      track(data.id);
    };
    await insert(gma, 100);
    await insert(imus, 40);

    const mine = await get(`/admin/sales?from=${day}&to=${day}`, { token: imusAdmin });
    assert.equal(mine.status, 200);
    assert.equal(Number(mine.body.data.totals.revenue), 40);

    const all = await get(`/admin/sales?from=${day}&to=${day}`, { token: superAdmin });
    assert.equal(Number(all.body.data.totals.revenue), 140);
    assert.deepEqual(
      all.body.data.by_branch.map((b) => [b.name, Number(b.revenue)]),
      [['GMA Terminal', 100], ['Imus', 40]],
    );

    const oneBranch = await get(`/admin/sales?from=${day}&to=${day}&branch_id=${gma}`, { token: superAdmin });
    assert.equal(Number(oneBranch.body.data.totals.revenue), 100);
  });

  it("manages only their own branch's riders", async () => {
    const list = await get('/admin/riders?limit=100', { token: imusAdmin });
    assert.equal(list.status, 200);
    for (const r of list.body.data) assert.ok(r.branches.some((b) => b.id === imus));
    assert.ok(!list.body.data.some((r) => r.email === 'rider1@3k.local'));

    const gmaRider = await userIdFor('rider');
    assert.equal((await patch(`/admin/riders/${gmaRider}`, { full_name: 'Nope' }, { token: imusAdmin })).status, 404);

    const elsewhere = await post(
      '/admin/riders',
      { branch_id: gma, email: `x${Date.now()}@3k.local`, password: 'testpass12345', full_name: 'X' },
      { token: imusAdmin },
    );
    assert.equal(elsewhere.status, 403);
  });

  it("manages only their own branch's kiosks", async () => {
    await issueKioskKey('GMA device', 'gma');

    const list = await get('/admin/kiosks', { token: imusAdmin });
    assert.equal(list.status, 200);
    for (const device of list.body.data) assert.equal(device.branch_id, imus);

    const gmaDevice = (await get(`/admin/kiosks?branch_id=${gma}`, { token: superAdmin })).body.data[0];
    assert.equal((await del(`/admin/kiosks/${gmaDevice.id}`, { token: imusAdmin })).status, 404);
    assert.equal((await post('/admin/kiosks', { name: 'X', branch_id: gma }, { token: imusAdmin })).status, 403);
  });

  it('cannot edit what every branch shares', async () => {
    assert.equal((await get('/admin/admins', { token: imusAdmin })).status, 403);
    assert.equal((await del('/admin/site-images/logo', { token: imusAdmin })).status, 403);
    assert.equal((await post('/categories', { name: 'Nope' }, { token: imusAdmin })).status, 403);
    const someone = await userIdFor('customer');
    assert.equal((await patch(`/admin/users/${someone}/role`, { role: 'admin' }, { token: imusAdmin })).status, 403);
  });

  it('sees their branches in their profile', async () => {
    const res = await get('/auth/profile', { token: imusAdmin });
    assert.deepEqual(res.body.data.branches.map((b) => b.name), ['Imus']);

    const all = await get('/auth/profile', { token: superAdmin });
    assert.ok(all.body.data.branches.length >= 7);
  });
});

describe('admin accounts (super admin)', () => {
  it('creates an admin for two branches, then narrows it to one', async () => {
    const email = `admin.test.${Date.now()}@3k.local`;
    const created = await post(
      '/admin/admins',
      { email, password: 'testpass12345', full_name: 'Two Branch Admin', branch_ids: [gma, imus] },
      { token: superAdmin },
    );
    assert.equal(created.status, 201, JSON.stringify(created.body));
    createdUsers.push(created.body.data.id);
    assert.equal(created.body.data.role, 'admin');

    const login = await post('/auth/login', { email, password: 'testpass12345' });
    const token = login.body.session.access_token;
    assert.equal((await get(`/admin/orders?branch_id=${gma}`, { token })).status, 200);
    assert.equal((await get(`/admin/orders?branch_id=${imus}`, { token })).status, 200);

    const narrowed = await patch(`/admin/admins/${created.body.data.id}`, { branch_ids: [imus] }, { token: superAdmin });
    assert.equal(narrowed.status, 200);
    assert.deepEqual(narrowed.body.data.branches.map((b) => b.id), [imus]);

    // Applies immediately, without waiting for the token to refresh.
    assert.equal((await get(`/admin/orders?branch_id=${gma}`, { token })).status, 403);

    const off = await patch(`/admin/admins/${created.body.data.id}`, { is_active: false }, { token: superAdmin });
    assert.equal(off.status, 200);
    assert.equal((await get('/admin/orders', { token })).status, 403, 'a deactivated admin is locked out');
  });

  it('needs at least one branch', async () => {
    const res = await post(
      '/admin/admins',
      { email: `a${Date.now()}@3k.local`, password: 'testpass12345', full_name: 'X', branch_ids: [] },
      { token: superAdmin },
    );
    assert.equal(res.status, 400);
  });

  it('will not turn a super admin into a branch admin', async () => {
    const res = await post(
      '/admin/admins',
      { email: 'admin@3k.local', password: 'testpass12345', full_name: 'X', branch_ids: [imus] },
      { token: superAdmin },
    );
    assert.equal(res.status, 409);
    const superId = await userIdFor('admin');
    assert.equal((await patch(`/admin/admins/${superId}`, { branch_ids: [imus] }, { token: superAdmin })).status, 404);
  });
});

describe('the cashier sees only their branch', () => {
  it('queues only their own orders and 404s the rest', async () => {
    const atImus = await placeOnlineOrder('customer', { branch_id: imus });

    const queue = await get('/pos/orders?limit=100', { token: cashier });
    assert.ok(!queue.body.data.some((o) => o.id === atImus.id));
    for (const order of queue.body.data) assert.equal(order.branch_id, gma);

    assert.equal((await get(`/pos/orders/${atImus.id}`, { token: cashier })).status, 404);
    assert.equal((await post(`/pos/orders/${atImus.id}/confirm`, undefined, { token: cashier })).status, 404);
    assert.equal((await post(`/pos/orders/${atImus.id}/void`, { reason: 'x' }, { token: cashier })).status, 404);

    const own = await get(`/pos/orders/${atImus.id}`, { token: cashierImus });
    assert.equal(own.status, 200);
  });

  it('rings walk-ins up at their own branch', async () => {
    const order = await placeWalkInOrder({}, 'cashierImus');
    assert.equal(order.branch_id, imus);
  });
});

describe('walk-ins by an admin', () => {
  it('must name the branch when the admin has more than one', async () => {
    const body = {
      fulfillment_type: 'take_out',
      customer_name: 'Admin Walk In',
      payment_method: 'cash',
      items: [{ product_id: (await placeWalkInOrder()).order_items[0].product_id, quantity: 1 }],
    };
    assert.equal((await post('/pos/orders', body, { token: superAdmin })).status, 400);

    const res = await post('/pos/orders', { ...body, branch_id: imus }, { token: superAdmin });
    assert.equal(res.status, 201);
    track(res.body.data.id);
    assert.equal(res.body.data.branch_id, imus);

    assert.equal((await post('/pos/orders', { ...body, branch_id: gma }, { token: cashierImus })).status, 403);
  });
});

describe("riders take only their branch's deliveries", () => {
  it('shows the order in its own branch pool only, and refuses a claim from elsewhere', async () => {
    const order = await placeOnlineOrder('customer', {
      fulfillment_type: 'delivery',
      delivery_address: ADDRESS,
    });
    await driveToReady(order.id);

    const pool = await get('/rider/pool', { token: rider });
    assert.ok(pool.body.data.some((o) => o.id === order.id));

    const elsewhere = await get('/rider/pool', { token: riderImus });
    assert.ok(!elsewhere.body.data.some((o) => o.id === order.id));

    const claim = await post(`/rider/orders/${order.id}/claim`, undefined, { token: riderImus });
    assert.equal(claim.status, 409);
  });
});

describe('row level security (what Realtime delivers)', () => {
  const browserClient = async (email, password) => {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false },
    });
    const { error } = await client.auth.signInWithPassword({ email, password });
    assert.equal(error, null);
    return client;
  };

  it("hides another branch's orders from a cashier's own client", async () => {
    const atGma = await placeWalkInOrder();

    const imusClient = await browserClient('cashier.imus@3k.local', 'testpass12345');
    const { data: hidden } = await imusClient.from('orders').select('id').eq('id', atGma.id);
    assert.equal(hidden.length, 0);

    const { data: shown } = await imusClient.from('orders').select('id').eq('branch_id', imus).limit(1);
    assert.ok(Array.isArray(shown));

    const adminClient = await browserClient('admin.imus@3k.local', 'testpass12345');
    const { data: alsoHidden } = await adminClient.from('orders').select('id').eq('id', atGma.id);
    assert.equal(alsoHidden.length, 0);
  });
});

describe('support chat per branch', () => {
  it("puts a visitor's message in the chosen branch's inbox only", async () => {
    const { data } = await db
      .from('chat_threads')
      .insert({ kind: 'support', branch_id: imus, last_sender_role: 'visitor', last_message: 'hi' })
      .select('id')
      .single();
    createdThreads.push(data.id);

    const gmaInbox = await get('/pos/chat/threads', { token: cashier });
    assert.ok(!gmaInbox.body.data.some((t) => t.id === data.id));
    assert.equal((await get(`/pos/chat/threads/${data.id}/messages`, { token: cashier })).status, 404);

    const imusInbox = await get('/pos/chat/threads', { token: cashierImus });
    assert.ok(imusInbox.body.data.some((t) => t.id === data.id));
  });
});

describe('employee gates per branch', () => {
  it('lets a branch admin set their own branch passwords', async () => {
    // Creates Imus's kiosk gate password if it is not set yet; the value is test-only.
    const res = await put('/admin/employee-passwords/kiosk', { branch_id: imus, password: 'imus-kiosk-1' }, { token: imusAdmin });
    assert.equal(res.status, 204);
  });
});
