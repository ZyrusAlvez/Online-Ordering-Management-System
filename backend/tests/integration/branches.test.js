import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { get, patch, post } from '../helpers/client.js';
import { tokenFor } from '../helpers/auth.js';
import { db } from '../helpers/db.js';

let superAdmin;
let imusAdmin;
const created = [];

const stamp = Date.now().toString(36);
const newBranch = (extra = {}) => ({
  name: `Test Branch ${stamp}${created.length}`,
  code: `test-${stamp}${created.length}`,
  latitude: 14.3,
  longitude: 120.95,
  opens_at: '09:00',
  closes_at: '20:00',
  ...extra,
});

before(async () => {
  superAdmin = await tokenFor('admin');
  imusAdmin = await tokenFor('branchAdmin');
});

after(async () => {
  if (created.length) await db.from('branches').delete().in('id', created);
});

describe('managing branches', () => {
  it('lets the super admin add a branch, which then shows publicly', async () => {
    const res = await post('/admin/branches', newBranch({ address: 'Test Rd, Cavite' }), { token: superAdmin });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    created.push(res.body.data.id);
    assert.equal(res.body.data.opens_at, '09:00');
    assert.equal(res.body.data.latitude, 14.3);
    assert.equal(res.body.data.is_active, true);

    const pub = await get('/branches');
    assert.ok(pub.body.data.some((b) => b.id === res.body.data.id));
  });

  it('edits hours and deactivates instead of deleting', async () => {
    const res = await post('/admin/branches', newBranch(), { token: superAdmin });
    created.push(res.body.data.id);
    const { id } = res.body.data;

    const hours = await patch(`/admin/branches/${id}`, { opens_at: null, closes_at: null }, { token: superAdmin });
    assert.equal(hours.status, 200);
    assert.equal(hours.body.data.opens_at, null, 'no hours = open around the clock');

    const off = await patch(`/admin/branches/${id}`, { is_active: false }, { token: superAdmin });
    assert.equal(off.body.data.is_active, false);

    const pub = await get('/branches');
    assert.ok(!pub.body.data.some((b) => b.id === id), 'a closed branch leaves the map');

    const all = await get('/admin/branches', { token: superAdmin });
    assert.ok(all.body.data.some((b) => b.id === id), 'but stays on the management list');
  });

  it('refuses a duplicate code', async () => {
    const first = await post('/admin/branches', newBranch(), { token: superAdmin });
    created.push(first.body.data.id);
    const again = await post('/admin/branches', { ...newBranch(), code: first.body.data.code }, { token: superAdmin });
    assert.equal(again.status, 409);
  });

  it('validates hours, code and location', async () => {
    const bad = [
      { opens_at: '09:00', closes_at: null },
      { opens_at: '20:00', closes_at: '09:00' },
      { opens_at: '9am', closes_at: '20:00' },
      { code: 'Has Spaces' },
      { latitude: 40.7, longitude: -74 },
      { phone: '12345' },
    ];
    for (const extra of bad) {
      const res = await post('/admin/branches', newBranch(extra), { token: superAdmin });
      assert.equal(res.status, 400, JSON.stringify(extra));
    }
    const unknown = await patch('/admin/branches/00000000-0000-4000-8000-000000000000', { name: 'X' }, { token: superAdmin });
    assert.equal(unknown.status, 404);
  });

  it('is for the super admin only', async () => {
    assert.equal((await get('/admin/branches', { token: imusAdmin })).status, 403);
    assert.equal((await post('/admin/branches', newBranch(), { token: imusAdmin })).status, 403);
  });
});
