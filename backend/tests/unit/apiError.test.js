import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiError, fromPostgrestError } from '../../src/utils/ApiError.js';

describe('ApiError', () => {
  it('is a real Error, so stack traces and instanceof both work', () => {
    const err = new ApiError(418, 'teapot');
    assert.ok(err instanceof Error);
    assert.ok(err instanceof ApiError);
    assert.equal(err.name, 'ApiError');
    assert.ok(err.stack.includes('teapot'));
  });

  it('carries status, message and optional details', () => {
    const err = new ApiError(400, 'bad', { field: ['required'] });
    assert.equal(err.status, 400);
    assert.equal(err.message, 'bad');
    assert.deepEqual(err.details, { field: ['required'] });
  });

  for (const [factory, status] of [
    ['badRequest', 400],
    ['unauthorized', 401],
    ['forbidden', 403],
    ['notFound', 404],
    ['conflict', 409],
    ['internal', 500],
  ]) {
    it(`${factory}() produces ${status}`, () => {
      assert.equal(ApiError[factory]().status, status);
      assert.equal(ApiError[factory]('custom').message, 'custom');
    });
  }
});

describe('fromPostgrestError', () => {
  it('maps "no rows returned" to 404', () => {
    assert.equal(fromPostgrestError({ code: 'PGRST116', message: 'none' }).status, 404);
  });

  it('maps a unique violation to 409', () => {
    assert.equal(fromPostgrestError({ code: '23505', message: 'dupe' }).status, 409);
  });

  it('maps a foreign key violation to 409', () => {
    assert.equal(fromPostgrestError({ code: '23503', message: 'fk' }).status, 409);
  });

  it('maps an RLS/privilege denial to 403', () => {
    assert.equal(fromPostgrestError({ code: '42501', message: 'denied' }).status, 403);
  });

  it('falls back to 500 for an unrecognised code', () => {
    assert.equal(fromPostgrestError({ code: 'XX000', message: 'boom' }).status, 500);
  });

  it('preserves the driver code in details for debugging', () => {
    assert.deepEqual(fromPostgrestError({ code: '23505', message: 'x' }).details, {
      code: '23505',
    });
  });

  it('uses the fallback message when the driver gives none', () => {
    assert.equal(fromPostgrestError({ code: 'XX000' }, 'fallback').message, 'fallback');
  });
});
