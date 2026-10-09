import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { del, get, patch, post } from '../helpers/client.js';
import { tokenFor } from '../helpers/auth.js';
import { db } from '../helpers/db.js';
import { branchId, cleanup, cleanupKiosks, placeWalkInOrder } from '../helpers/fixtures.js';

let admin;
let cashier;
let customer;
let gma;
const createdRiders = [];
const createdKiosks = [];

before(async () => {
  admin = await tokenFor('admin');
  cashier = await tokenFor('cashier');
  customer = await tokenFor('customer');
  gma = await branchId('gma');
});

after(async () => {
  await cleanup();
  await cleanupKiosks();
  for (const id of createdKiosks) await db.from('kiosk_devices').delete().eq('id', id);
  for (const id of createdRiders) await db.auth.admin.deleteUser(id).catch(() => {});
});

describe('admin authorization', () => {
  it('403s a cashier', async () => {
    assert.equal((await get('/admin/orders', { token: cashier })).status, 403);
  });

  it('403s a customer', async () => {
    assert.equal((await get('/admin/kiosks', { token: customer })).status, 403);
  });

  it('401s with no token', async () => {
    assert.equal((await get('/admin/orders')).status, 401);
  });
});

describe('GET /admin/orders', () => {
  it('sees orders across every channel', async () => {
    await placeWalkInOrder();
    const res = await get('/admin/orders?limit=50', { token: admin });

    assert.equal(res.status, 200);
    assert.ok(res.body.meta.total >= 1);
  });

  it('filters by channel', async () => {
    await placeWalkInOrder();
    const res = await get('/admin/orders?channel=pos', { token: admin });
    for (const order of res.body.data) assert.equal(order.channel, 'pos');
  });

  it('filters by a date range', async () => {
    await placeWalkInOrder();
    const from = new Date(Date.now() - 60_000).toISOString();
    const res = await get(`/admin/orders?from=${from}`, { token: admin });

    assert.equal(res.status, 200);
    for (const order of res.body.data) {
      assert.ok(new Date(order.created_at) >= new Date(from));
    }
  });

  it('returns nothing for a window before any order existed', async () => {
    const to = '2020-01-01T00:00:00.000Z';
    const res = await get(`/admin/orders?to=${to}`, { token: admin });
    assert.equal(res.body.meta.total, 0);
  });

  it('rejects a non-ISO date', async () => {
    assert.equal((await get('/admin/orders?from=yesterday', { token: admin })).status, 400);
  });
});

describe('kiosk device management', () => {
  it('issues a device and returns the raw key exactly once', async () => {
    const res = await post('/admin/kiosks', { name: 'Test Terminal', branch_id: gma }, { token: admin });

    assert.equal(res.status, 201);
    assert.match(res.body.data.key, /^kiosk_/);
    assert.ok(res.body.data.warning.includes('cannot be retrieved'));
    createdKiosks.push(res.body.data.id);

    const list = await get('/admin/kiosks', { token: admin });
    const device = list.body.data.find((d) => d.id === res.body.data.id);
    assert.equal('key' in device, false, 'the raw key must not be listable');
    assert.equal('key_hash' in device, false, 'the hash must never be exposed');
  });

  it('stores only a hash of the key', async () => {
    const res = await post('/admin/kiosks', { name: 'Hash Check', branch_id: gma }, { token: admin });
    createdKiosks.push(res.body.data.id);

    const { data } = await db
      .from('kiosk_devices')
      .select('key_hash')
      .eq('id', res.body.data.id)
      .single();

    assert.match(data.key_hash, /^[0-9a-f]{64}$/);
    assert.notEqual(data.key_hash, res.body.data.key);
  });

  it('requires a name and a branch', async () => {
    assert.equal((await post('/admin/kiosks', { branch_id: gma }, { token: admin })).status, 400);
    assert.equal((await post('/admin/kiosks', { name: 'No Branch' }, { token: admin })).status, 400);
  });

  it('revokes a device', async () => {
    const created = await post('/admin/kiosks', { name: 'To Revoke', branch_id: gma }, { token: admin });
    createdKiosks.push(created.body.data.id);

    const res = await del(`/admin/kiosks/${created.body.data.id}`, { token: admin });
    assert.equal(res.status, 204);

    const list = await get('/admin/kiosks', { token: admin });
    const device = list.body.data.find((d) => d.id === created.body.data.id);
    assert.equal(device.is_active, false, 'the row is kept so past orders keep their reference');
  });

  it('404s revoking an unknown device', async () => {
    const res = await del('/admin/kiosks/00000000-0000-4000-8000-000000000000', { token: admin });
    assert.equal(res.status, 404);
  });
});

describe('rider account management', () => {
  it('creates a rider with the rider role', async () => {
    const email = `rider.test.${Date.now()}@3k.local`;
    const res = await post(
      '/admin/riders',
      { branch_id: gma, email, password: 'testpass12345', full_name: 'Test Rider', phone: '09171112222' },
      { token: admin },
    );

    assert.equal(res.status, 201);
    assert.equal(res.body.data.role, 'rider');
    assert.equal(res.body.data.full_name, 'Test Rider');
    assert.deepEqual(res.body.data.branches.map((b) => b.id), [gma], 'a rider works at one branch');
    createdRiders.push(res.body.data.id);
  });

  it('sets the role in auth metadata too, so the JWT carries it', async () => {
    const email = `rider.jwt.${Date.now()}@3k.local`;
    const created = await post(
      '/admin/riders',
      { branch_id: gma, email, password: 'testpass12345', full_name: 'JWT Rider' },
      { token: admin },
    );
    createdRiders.push(created.body.data.id);

    const login = await post('/auth/login', { email, password: 'testpass12345' });
    assert.equal(login.body.user.app_metadata.role, 'rider');
  });

  it('lists riders and not other roles', async () => {
    const res = await get('/admin/riders', { token: admin });
    assert.equal(res.status, 200);
    for (const profile of res.body.data) assert.equal(profile.role, 'rider');
  });

  it('requires a branch', async () => {
    const res = await post(
      '/admin/riders',
      { email: `nobranch${Date.now()}@3k.local`, password: 'testpass12345', full_name: 'X' },
      { token: admin },
    );
    assert.equal(res.status, 400);
  });

  it('rejects a weak password', async () => {
    const res = await post(
      '/admin/riders',
      { branch_id: gma, email: `x${Date.now()}@3k.local`, password: 'short', full_name: 'X' },
      { token: admin },
    );
    assert.equal(res.status, 400);
  });

  it('rejects a malformed email', async () => {
    const res = await post(
      '/admin/riders',
      { branch_id: gma, email: 'not-an-email', password: 'testpass12345', full_name: 'X' },
      { token: admin },
    );
    assert.equal(res.status, 400);
  });

  it('deactivates a rider', async () => {
    const email = `rider.deact.${Date.now()}@3k.local`;
    const created = await post(
      '/admin/riders',
      { branch_id: gma, email, password: 'testpass12345', full_name: 'Deactivate Me' },
      { token: admin },
    );
    createdRiders.push(created.body.data.id);

    const res = await patch(
      `/admin/riders/${created.body.data.id}`,
      { is_active: false },
      { token: admin },
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.data.is_active, false);
  });

  it('rejects an empty update instead of a silent no-op', async () => {
    const res = await patch(
      '/admin/riders/00000000-0000-4000-8000-000000000000',
      {},
      { token: admin },
    );
    assert.equal(res.status, 400);
  });

  it('404s updating a profile that is not a rider', async () => {
    const { data: adminProfile } = await db
      .from('profiles')
      .select('id')
      .eq('role', 'super_admin')
      .limit(1)
      .single();

    const res = await patch(
      `/admin/riders/${adminProfile.id}`,
      { is_active: false },
      { token: admin },
    );
    assert.equal(res.status, 404, 'the rider endpoint must not touch an admin account');
  });
});

describe('PATCH /admin/users/:id/role', () => {
  it('rejects an unknown role', async () => {
    const res = await patch(
      '/admin/users/00000000-0000-4000-8000-000000000000/role',
      { role: 'wizard' },
      { token: admin },
    );
    assert.equal(res.status, 400);
  });
});
