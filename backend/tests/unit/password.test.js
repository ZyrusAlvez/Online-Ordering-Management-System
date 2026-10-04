import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashPassword, verifyPassword } from '../../src/utils/password.js';

describe('hashPassword / verifyPassword', () => {
  it('accepts the password it hashed', async () => {
    assert.equal(await verifyPassword('open-sesame', await hashPassword('open-sesame')), true);
  });

  it('rejects a different password', async () => {
    assert.equal(await verifyPassword('open-sesame!', await hashPassword('open-sesame')), false);
  });

  it('salts each hash, so equal passwords do not produce equal hashes', async () => {
    assert.notEqual(await hashPassword('same'), await hashPassword('same'));
  });

  it('never stores the plaintext', async () => {
    assert.ok(!(await hashPassword('plain-text-secret')).includes('plain-text-secret'));
  });

  it('rejects a missing or malformed stored hash instead of throwing', async () => {
    assert.equal(await verifyPassword('x', undefined), false);
    assert.equal(await verifyPassword('x', 'not-a-hash'), false);
    assert.equal(await verifyPassword('x', ':'), false);
  });
});
