/**
 * Field rules for the forms. These mirror backend/src/validators/fields.js, which
 * is the authority (and the database enforces the same limits): when a rule
 * changes, change it there, here, and in docs/DATA-DICTIONARY.md together.
 *
 * Browsers enforce most of these through attributes (maxLength, pattern...), so
 * the constants below are what the forms spread onto their inputs.
 */

/** Philippine mobile number: 11 digits starting 09, e.g. 09171234567. */
export const PHONE_PATTERN = /^09\d{9}$/;
export const PHONE_MESSAGE = 'Enter an 11-digit mobile number starting with 09, e.g. 09171234567';

export const isValidPhone = (value) => PHONE_PATTERN.test(String(value ?? '').trim());

/** Keeps digits only and at most 11 of them, so letters and spaces never get in. */
export const cleanPhoneInput = (value) => String(value ?? '').replace(/\D/g, '').slice(0, 11);

/** Maximum lengths, matching the API and the database CHECK constraints. */
export const LIMITS = {
  name: 120,
  shortName: 60,
  email: 254,
  password: 72,
  employeePassword: 200,
  street: 300,
  barangay: 120,
  city: 120,
  landmark: 300,
  addressNotes: 500,
  orderNotes: 1000,
  itemNote: 500,
  categoryName: 100,
  productName: 200,
  optionLabel: 100,
  choice: 100,
  description: 2000,
  reason: 500,
  deviceName: 120,
  chatMessage: 1000,
  search: 120,
  maxPrice: 999999.99,
  maxQuantity: 99,
};

/** Pesos with at most two decimals, for typed amounts. */
export const isValidMoney = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= LIMITS.maxPrice && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
};
