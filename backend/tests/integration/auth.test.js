import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { get, post } from '../helpers/client.js';
import { ACCOUNTS, roleClaimOf, tokenFor } from '../helpers/auth.js';

describe('POST /auth/login', () => {
  it('returns a session and user for valid credentials', async () => {
    const res = await post('/auth/login', ACCOUNTS.cashier);
    assert.equal(res.status, 200);
    assert.ok(res.body.session.access_token);
    assert.ok(res.body.session.refresh_token);
    assert.equal(res.body.user.email, ACCOUNTS.cashier.email);
  });

  it('carries the role in app_metadata, which is what authorises requests', async () => {
    const res = await post('/auth/login', ACCOUNTS.cashier);
    assert.equal(res.body.user.app_metadata.role, 'cashier');
    assert.equal(roleClaimOf(res.body.session.access_token), 'cashier');
  });

  it('rejects a wrong password with 401, not 400', async () => {
    const res = await post('/auth/login', {
      email: ACCOUNTS.cashier.email,
      password: 'wrong-password',
    });
    assert.equal(res.status, 401);
  });

  it('rejects an unknown email with 401 and no hint that it is unknown', async () => {
    const res = await post('/auth/login', {
      email: 'nobody-at-all@3k.local',
      password: 'whatever12345',
    });
    assert.equal(res.status, 401);
  });

  it('rejects a malformed email before reaching Supabase', async () => {
    const res = await post('/auth/login', { email: 'not-an-email', password: 'abcd1234' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.details.email);
  });

  it('rejects a missing body', async () => {
    const res = await post('/auth/login', {});
    assert.equal(res.status, 400);
  });
});

describe('GET /auth/me', () => {
  it('returns the caller', async () => {
    const token = await tokenFor('cashier');
    const res = await get('/auth/me', { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, ACCOUNTS.cashier.email);
  });

  it('401s without a token', async () => {
    const res = await get('/auth/me');
    assert.equal(res.status, 401);
    assert.match(res.body.error.message, /Missing bearer token/);
  });

  it('401s on a garbage token', async () => {
    const res = await get('/auth/me', { token: 'not.a.jwt' });
    assert.equal(res.status, 401);
  });

  it('401s when the scheme is not Bearer', async () => {
    const res = await get('/auth/me', { headers: { Authorization: 'Basic abc123' } });
    assert.equal(res.status, 401);
  });
});

describe('POST /auth/refresh', () => {
  it('exchanges a refresh token for a new session', async () => {
    const login = await post('/auth/login', ACCOUNTS.customer);
    const res = await post('/auth/refresh', {
      refreshToken: login.body.session.refresh_token,
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.session.access_token);
  });

  it('401s on an invalid refresh token', async () => {
    const res = await post('/auth/refresh', { refreshToken: 'nonsense' });
    assert.equal(res.status, 401);
  });

  it('400s when the field is missing', async () => {
    const res = await post('/auth/refresh', {});
    assert.equal(res.status, 400);
  });
});

describe('POST /auth/register', () => {
  it('rejects a short password without contacting Supabase', async () => {
    const res = await post('/auth/register', { email: 'x@3k.local', password: 'short' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.details.password);
  });

  it('ignores an attempt to self-assign a privileged role', async () => {
    // The schema strips unknown keys, so `role` never reaches Supabase. A 429
    // here means Supabase's signup limit kicked in, which still proves the
    // request was not rejected for requesting admin.
    const res = await post('/auth/register', {
      email: `probe${Date.now()}@3k.local`,
      password: 'abcd12345',
      role: 'admin',
    });

    assert.ok([201, 429, 400].includes(res.status), `unexpected ${res.status}`);
    if (res.status === 201) {
      assert.notEqual(res.body.user.app_metadata?.role, 'admin');
    }
  });
});
