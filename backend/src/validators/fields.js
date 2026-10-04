import { z } from 'zod';

/**
 * The one definition of each kind of field the app accepts. Every validator
 * builds on these, the forms in the frontend mirror them (frontend/src/lib/
 * validation.js), and the database enforces the same limits with CHECK
 * constraints. The full list lives in docs/data-dictionary.md — change a rule
 * in all of those places together.
 */

/** Philippine mobile number: exactly 11 digits starting 09, e.g. 09171234567. */
export const PHONE_PATTERN = /^09\d{9}$/;
export const PHONE_MESSAGE = 'Enter an 11-digit mobile number starting with 09, e.g. 09171234567';
export const phone = z.string().trim().regex(PHONE_PATTERN, PHONE_MESSAGE);

/** Free text. Trimmed, so a field of spaces is empty, not valid. */
export const requiredText = (max, message = 'Required') => z.string().trim().min(1, message).max(max);
export const optionalText = (max) => z.string().trim().max(max);

/** Names of people, products, categories, devices... */
export const personName = (max = 120) => requiredText(max, 'Name is required');

export const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);

/** bcrypt, which Supabase Auth uses, ignores everything past 72 bytes. */
export const password = z.string().min(8, 'Password must be at least 8 characters').max(72);

export const MAX_AMOUNT = 999999.99;

/** Pesos: not negative, at most 2 decimals, at most 999,999.99 (the database limit). */
export const money = z
  .number()
  .finite()
  .nonnegative()
  .max(MAX_AMOUNT)
  // Compare in centavos with a tolerance: 59.99 + 60 is 119.99000000000001 in floating point.
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'At most 2 decimal places');

/** Units of one product on one line. */
export const quantity = z.number().int().min(1).max(99);

/** Display order. Bounded so it can never overflow the integer column. */
export const sortOrder = z.number().int().min(-9999).max(9999);

/** Only http(s) links, so a stored value can never be a javascript: or data: URL. */
export const imageUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((u) => /^https?:\/\//i.test(u), 'Must be an http(s) link');

/**
 * Map pin. Both coordinates or neither; bounded to the Philippines so a
 * mistyped or swapped pair is rejected instead of dropping a pin in the sea.
 */
export const latitude = z.number().min(4).max(22);
export const longitude = z.number().min(116).max(128);
