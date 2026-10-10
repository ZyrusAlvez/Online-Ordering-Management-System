import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { get, post, put } from '../helpers/client.js';
import { ACCOUNTS, tokenFor } from '../helpers/auth.js';
import { db } from '../helpers/db.js';
import { branchId } from '../helpers/fixtures.js';

// Only wrong gate attempts count toward the 10-per-15-minutes limiter, so this
// file budgets its failures: 5 cashier and 3 kiosk before the rate-limit test.
const KIOSK_PASSWORD = process.env.TEST_KIOSK_PASSWORD;
const CASHIER_PASSWORD = ACCOUNTS.cashier.password;

let admin;
let customer;
// Every gate is per branch; these tests use GMA Terminal (whose cashier is cashier@3k.local).
let gma;
let imus;
const provisioned = [];

before(async () => {
  admin = await tokenFor('admin');
  customer = await tokenFor('customer');
  gma = await branchId('gma');
  imus = await branchId('imus');
});

after(async () => {
  // Leave the gates exactly as we found them.
  await put('/admin/employee-passwords/cashier', { branch_id: gma, password: CASHIER_PASSWORD }, { token: admin });
  await put('/admin/employee-passwords/kiosk', { branch_id: gma, password: KIOSK_PASSWORD }, { token: admin });
  for (const id of provisioned) await db.from('kiosk_devices').delete().eq('id', id);
});

describe('POST /employee/cashier/login', () => {
  it('signs in with the cashier password and returns a working POS session', async () => {
    const res = await post('/employee/cashier/login', { branch_id: gma, password: CASHIER_PASSWORD });

    assert.equal(res.status, 200);
    assert.equal(res.body.user.app_metadata.role, 'cashier');
    assert.ok(res.body.session.access_token);

    const pos = await get('/pos/orders', { token: res.body.session.access_token });
    assert.equal(pos.status, 200);
  });

  it("signs in to that branch only: GMA's password is not Imus's", async () => {
    const res = await post('/employee/cashier/login', { branch_id: imus, password: CASHIER_PASSWORD });
    assert.equal(res.status, 401);
  });

  it('rejects a wrong password', async () => {
    const res = await post('/employee/cashier/login', { branch_id: gma, password: 'definitely-wrong' });
    assert.equal(res.status, 401);
  });
});

describe('POST /employee/kiosk/unlock', () => {
  it('provisions a device key that the kiosk API accepts', async () => {
    const res = await post('/employee/kiosk/unlock', {
      branch_id: gma,
      password: KIOSK_PASSWORD,
      device_name: 'Unlock Test',
    });

    assert.equal(res.status, 201);
    assert.match(res.body.data.key, /^kiosk_/);
    provisioned.push(res.body.data.id);

    // A random order id is 404 (authenticated, not found) rather than 401.
    const probe = await get('/kiosk/orders/00000000-0000-0000-0000-000000000000', {
      kioskKey: res.body.data.key,
    });
    assert.equal(probe.status, 404);

    // The device belongs to the branch it was unlocked for.
    const me = await get('/kiosk/me', { kioskKey: res.body.data.key });
    assert.equal(me.status, 200);
    assert.equal(me.body.data.branch.id, gma);
  });

  it("does not unlock another branch with this branch's password", async () => {
    const res = await post('/employee/kiosk/unlock', { branch_id: imus, password: KIOSK_PASSWORD });
    assert.equal(res.status, 401);
  });

  it('rejects a wrong password and issues no key', async () => {
    const res = await post('/employee/kiosk/unlock', { branch_id: gma, password: 'definitely-wrong' });

    assert.equal(res.status, 401);
    assert.equal(res.body.data, undefined);
  });
});

describe('PUT /admin/employee-passwords/:role', () => {
  it('403s a non-admin and 401s an anonymous caller', async () => {
    const body = { branch_id: gma, password: 'newpass123' };
    assert.equal((await put('/admin/employee-passwords/kiosk', body, { token: customer })).status, 403);
    assert.equal((await put('/admin/employee-passwords/kiosk', body)).status, 401);
  });

  it("403s a branch admin setting another branch's passwords", async () => {
    const imusAdmin = await tokenFor('branchAdmin');
    const res = await put('/admin/employee-passwords/kiosk', { branch_id: gma, password: 'newpass123' }, { token: imusAdmin });
    assert.equal(res.status, 403);
  });

  it('requires a branch', async () => {
    const res = await put('/admin/employee-passwords/kiosk', { password: 'newpass123' }, { token: admin });
    assert.equal(res.status, 400);
  });

  it('rejects too-short passwords and unknown roles', async () => {
    assert.equal(
      (await put('/admin/employee-passwords/kiosk', { branch_id: gma, password: '123' }, { token: admin })).status,
      400,
    );
    assert.equal(
      (await put('/admin/employee-passwords/manager', { branch_id: gma, password: 'newpass123' }, { token: admin }))
        .status,
      400,
    );
  });

  it('changes the kiosk password: the new one works and the old one stops', async () => {
    const change = await put(
      '/admin/employee-passwords/kiosk',
      { branch_id: gma, password: 'kiosk-new-pass' },
      { token: admin },
    );
    assert.equal(change.status, 204);

    const fresh = await post('/employee/kiosk/unlock', { branch_id: gma, password: 'kiosk-new-pass' });
    assert.equal(fresh.status, 201);
    provisioned.push(fresh.body.data.id);

    assert.equal((await post('/employee/kiosk/unlock', { branch_id: gma, password: KIOSK_PASSWORD })).status, 401);
  });

  it('changes the cashier password: the new one works and the old one stops', async () => {
    const change = await put(
      '/admin/employee-passwords/cashier',
      { branch_id: gma, password: 'cashier-new-pass' },
      { token: admin },
    );
    assert.equal(change.status, 204);

    assert.equal(
      (await post('/employee/cashier/login', { branch_id: gma, password: 'cashier-new-pass' })).status,
      200,
    );
    assert.equal(
      (await post('/employee/cashier/login', { branch_id: gma, password: CASHIER_PASSWORD })).status,
      401,
    );
  });
});

// Keep this last: it deliberately exhausts the gate limiter.
describe('gate rate limiting', () => {
  // The tests above rotate both passwords and only restore them in the file's
  // after() hook, so put the known ones back before logging in with them.
  before(async () => {
    await put('/admin/employee-passwords/cashier', { branch_id: gma, password: CASHIER_PASSWORD }, { token: admin });
    await put('/admin/employee-passwords/kiosk', { branch_id: gma, password: KIOSK_PASSWORD }, { token: admin });
  });

  it('does not count correct logins, so several registers can sign in freely', async () => {
    for (let i = 0; i < 12; i += 1) {
      const res = await post('/employee/cashier/login', { branch_id: gma, password: CASHIER_PASSWORD });
      assert.equal(res.status, 200, `login ${i + 1}`);
    }
  });

  it('429s after repeated wrong guesses', async () => {
    let status;
    for (let i = 0; i < 14; i += 1) {
      ({ status } = await post('/employee/cashier/login', { branch_id: gma, password: 'guess' }));
      if (status === 429) break;
    }
    assert.equal(status, 429);
  });

  it('gives the kiosk its own budget, so a locked cashier gate does not lock the kiosk', async () => {
    const res = await post('/employee/kiosk/unlock', { branch_id: gma, password: KIOSK_PASSWORD, device_name: 'Limit Test' });
    assert.equal(res.status, 201);
    provisioned.push(res.body.data.id);
  });
});
