import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateKioskKey, hashKioskKey } from '../../src/middleware/kiosk.js';

describe('generateKioskKey', () => {
  it('is prefixed so the key is recognisable in logs and config', () => {
    assert.match(generateKioskKey(), /^kiosk_/);
  });

  it('is url-safe, so it survives headers and env files intact', () => {
    assert.match(generateKioskKey(), /^kiosk_[A-Za-z0-9_-]+$/);
  });

  it('carries enough entropy to be unguessable', () => {
    // 24 random bytes -> 32 base64url chars.
    assert.ok(generateKioskKey().length >= 38);
  });

  it('never repeats', () => {
    const keys = new Set(Array.from({ length: 500 }, generateKioskKey));
    assert.equal(keys.size, 500);
  });
});

describe('hashKioskKey', () => {
  it('produces a sha256 hex digest', () => {
    assert.match(hashKioskKey('kiosk_abc'), /^[0-9a-f]{64}$/);
  });

  it('is deterministic, so a presented key matches the stored hash', () => {
    assert.equal(hashKioskKey('kiosk_abc'), hashKioskKey('kiosk_abc'));
  });

  it('differs for different keys', () => {
    assert.notEqual(hashKioskKey('kiosk_abc'), hashKioskKey('kiosk_abd'));
  });

  it('does not leak the key itself', () => {
    const key = generateKioskKey();
    assert.equal(hashKioskKey(key).includes(key.slice(6)), false);
  });
});
