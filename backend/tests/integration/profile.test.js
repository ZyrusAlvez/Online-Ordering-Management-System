import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { get, patch, post } from '../helpers/client.js';
import { tokenFor } from '../helpers/auth.js';
import { db } from '../helpers/db.js';

const PASSWORD = 'profile-pass-12345';
const email = `profile-${Date.now()}@3k.local`;
const ADDRESS = { line1: '12 Rizal St', barangay: 'Poblacion', city: 'Davao City', landmark: 'Blue gate' };

let userId;
let userClient;
let token;

const freshToken = async () => (await userClient.auth.refreshSession()).data.session.access_token;

before(async () => {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Original Name', avatar_url: 'https://example.com/me.png' },
  });
  if (error) throw error;
  userId = data.user.id;

  userClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
  const { error: signInError } = await userClient.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw signInError;
  token = await freshToken();
});

after(async () => {
  if (userId) await db.auth.admin.deleteUser(userId); // the profile row cascades
});

describe('GET /auth/profile', () => {
  it('returns the caller’s profile with how they sign in', async () => {
    const res = await get('/auth/profile', { token });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.email, email);
    assert.equal(res.body.data.full_name, 'Original Name');
    assert.equal(res.body.data.phone, null);
    assert.equal(res.body.data.default_address, null);
    assert.equal(res.body.data.role, 'customer');
    assert.equal(res.body.data.sign_in_method, 'email');
    assert.equal(res.body.data.can_change_password, true);
    assert.equal(res.body.data.avatar_url, 'https://example.com/me.png');
  });

  it('401s without a token', async () => {
    assert.equal((await get('/auth/profile')).status, 401);
  });
});

describe('PATCH /auth/profile', () => {
  it('saves name, phone and address, and returns them', async () => {
    const res = await patch(
      '/auth/profile',
      { full_name: 'New Name', phone: '09171234567', default_address: ADDRESS },
      { token },
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.data.full_name, 'New Name');
    assert.equal(res.body.data.phone, '09171234567');
    assert.deepEqual(res.body.data.default_address, ADDRESS);

    const again = await get('/auth/profile', { token });
    assert.deepEqual(again.body.data.default_address, ADDRESS);
  });

  it('keeps the name on orders (user_metadata) in step, without losing the avatar', async () => {
    const { data } = await db.auth.admin.getUserById(userId);
    assert.equal(data.user.user_metadata.full_name, 'New Name');
    assert.equal(data.user.user_metadata.avatar_url, 'https://example.com/me.png');
  });

  it('clears the phone and address with null', async () => {
    const res = await patch('/auth/profile', { phone: null, default_address: null }, { token });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.phone, null);
    assert.equal(res.body.data.default_address, null);
  });

  it('updates only the fields sent', async () => {
    await patch('/auth/profile', { phone: '09170000000' }, { token });
    const res = await patch('/auth/profile', { full_name: 'Only Name' }, { token });

    assert.equal(res.body.data.full_name, 'Only Name');
    assert.equal(res.body.data.phone, '09170000000');
  });

  it('rejects bad input', async () => {
    assert.equal((await patch('/auth/profile', { phone: '123' }, { token })).status, 400);
    assert.equal((await patch('/auth/profile', { full_name: '   ' }, { token })).status, 400);
    assert.equal((await patch('/auth/profile', { default_address: { city: 'Davao' } }, { token })).status, 400);
    assert.equal((await patch('/auth/profile', {}, { token })).status, 400);
  });

  it('refuses to change role or active status through the API', async () => {
    const role = await patch('/auth/profile', { role: 'admin' }, { token });
    const active = await patch('/auth/profile', { is_active: false }, { token });

    assert.equal(role.status, 400);
    assert.equal(active.status, 400);
    const { data } = await db.from('profiles').select('role, is_active').eq('id', userId).single();
    assert.deepEqual(data, { role: 'customer', is_active: true });
  });

  it('refuses a direct write to the profiles table with the public key', async () => {
    // Used to be allowed by RLS: a user could make themselves admin or reactivate a banned account.
    const { data } = await userClient
      .from('profiles')
      .update({ role: 'admin', is_active: false })
      .eq('id', userId)
      .select();
    assert.deepEqual(data ?? [], []);

    const row = await db.from('profiles').select('role, is_active').eq('id', userId).single();
    assert.deepEqual(row.data, { role: 'customer', is_active: true });
  });

  it('401s without a token', async () => {
    assert.equal((await patch('/auth/profile', { full_name: 'x' })).status, 401);
  });

  it('only ever edits the caller', async () => {
    const other = await tokenFor('customer2');
    await patch('/auth/profile', { phone: '09175550000' }, { token: other });

    const mine = await get('/auth/profile', { token });
    assert.notEqual(mine.body.data.phone, '09175550000');

    const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
    const customer2 = data.users.find((u) => u.email === 'customer2@3k.local');
    await db.from('profiles').update({ phone: null }).eq('id', customer2.id);
  });
});

describe('POST /auth/password', () => {
  const change = (body, t = token) => post('/auth/password', body, { token: t });

  it('rejects a wrong current password without signing the user out', async () => {
    const res = await change({ current_password: 'not-my-password', new_password: 'brand-new-pass-1' });

    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /incorrect/i);
  });

  it('rejects a short new password', async () => {
    const res = await change({ current_password: PASSWORD, new_password: 'short' });
    assert.equal(res.status, 400);
  });

  it('changes the password: the new one logs in and the old one stops', async () => {
    const res = await change({ current_password: PASSWORD, new_password: 'brand-new-pass-1' });
    assert.equal(res.status, 204);

    const fresh = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false },
    });
    const ok = await fresh.auth.signInWithPassword({ email, password: 'brand-new-pass-1' });
    assert.equal(ok.error, null);
    const old = await fresh.auth.signInWithPassword({ email, password: PASSWORD });
    assert.ok(old.error);
  });

  it('401s without a token', async () => {
    assert.equal((await post('/auth/password', { current_password: 'a', new_password: 'bbbbbbbb' })).status, 401);
  });

  it('is closed to the shared cashier login (admins change that one)', async () => {
    const cashier = await tokenFor('cashier');
    const res = await change({ current_password: 'whatever', new_password: 'bbbbbbbb' }, cashier);
    assert.equal(res.status, 403);
  });
});
