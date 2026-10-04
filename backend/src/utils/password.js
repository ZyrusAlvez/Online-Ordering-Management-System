import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const KEY_LENGTH = 64;

/** `<salt hex>:<hash hex>` — the salt is per password, so equal passwords hash differently. */
export const hashPassword = async (password) => {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
};

export const verifyPassword = async (password, stored) => {
  const [saltHex, hashHex] = String(stored ?? '').split(':');
  if (!saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, 'hex');
  const derived = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length);

  return derived.length === expected.length && timingSafeEqual(derived, expected);
};
