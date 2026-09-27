import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { get, post } from '../helpers/client.js';

describe('GET /health', () => {
  it('reports liveness without touching the database', async () => {
    const res = await get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.ok(typeof res.body.uptime === 'number');
    assert.ok(Date.parse(res.body.timestamp));
  });
});

describe('GET /health/supabase', () => {
  it('confirms the Supabase credentials actually work', async () => {
    const res = await get('/health/supabase');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });
});

describe('unknown routes', () => {
  it('404s with a helpful message rather than an empty body', async () => {
    const res = await get('/does-not-exist');
    assert.equal(res.status, 404);
    assert.match(res.body.error.message, /does not exist/);
  });

  it('404s an unknown method on a known path', async () => {
    const res = await post('/health', {});
    assert.equal(res.status, 404);
  });
});
