import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { get } from '../helpers/client.js';

describe('GET /site/gcash', () => {
  it('serves the account customers pay into, without a login', async (t) => {
    const res = await get('/site/gcash');
    assert.equal(res.status, 200);
    if (res.body.data === null) return t.skip('GCash is not configured in this environment');

    assert.deepEqual(Object.keys(res.body.data).sort(), ['name', 'number', 'qr_image']);
    assert.ok(res.body.data.name);
    assert.ok(res.body.data.number);
  });
});
