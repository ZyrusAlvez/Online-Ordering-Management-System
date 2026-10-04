import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  email,
  imageUrl,
  money,
  password,
  personName,
  phone,
  quantity,
} from '../../src/validators/fields.js';
import { deliveryAddressSchema } from '../../src/validators/order.validators.js';
import { createRiderSchema, updateRiderSchema } from '../../src/validators/admin.validators.js';
import { updateProfileSchema } from '../../src/validators/auth.validators.js';
import { productBody } from '../../src/validators/catalog.validators.js';

const ok = (schema, value) => schema.safeParse(value).success;

describe('phone', () => {
  it('accepts exactly 11 digits starting with 09', () => {
    assert.equal(ok(phone, '09171234567'), true);
    assert.equal(ok(phone, '09999999999'), true);
  });

  it('trims surrounding spaces', () => {
    assert.equal(phone.parse('  09171234567 '), '09171234567');
  });

  it('rejects the wrong length', () => {
    assert.equal(ok(phone, '0917123456'), false, '10 digits');
    assert.equal(ok(phone, '091712345678'), false, '12 digits');
    assert.equal(ok(phone, ''), false);
  });

  it('rejects numbers that do not start with 09', () => {
    assert.equal(ok(phone, '19171234567'), false);
    assert.equal(ok(phone, '08171234567'), false);
  });

  it('rejects anything that is not plain digits', () => {
    for (const bad of ['0917-123-4567', '0917 123 4567', '+639171234567', '0917123456a', '(0917)1234567']) {
      assert.equal(ok(phone, bad), false, bad);
    }
  });

  it('is the rule for every phone field', () => {
    assert.equal(ok(updateProfileSchema, { phone: '123' }), false);
    assert.equal(ok(updateProfileSchema, { phone: '09171234567' }), true);
    assert.equal(ok(updateProfileSchema, { phone: null }), true, 'null clears it');
    assert.equal(ok(updateRiderSchema, { phone: '1234567' }), false);
    assert.equal(ok(updateRiderSchema, { phone: null }), true);
    assert.equal(
      ok(createRiderSchema, { email: 'a@b.co', password: 'password1', full_name: 'Pedro', phone: '555' }),
      false,
    );
  });
});

describe('text fields', () => {
  it('rejects a name that is only spaces', () => {
    assert.equal(ok(personName(), '   '), false);
    assert.equal(ok(personName(), ''), false);
  });

  it('trims names and enforces the maximum', () => {
    assert.equal(personName().parse('  Maria  '), 'Maria');
    assert.equal(ok(personName(120), 'x'.repeat(120)), true);
    assert.equal(ok(personName(120), 'x'.repeat(121)), false);
  });
});

describe('email and password', () => {
  it('normalises email to trimmed lower case', () => {
    assert.equal(email.parse('  Maria@Example.COM '), 'maria@example.com');
    assert.equal(ok(email, 'not-an-email'), false);
  });

  it('requires 8 to 72 characters', () => {
    assert.equal(ok(password, 'short'), false);
    assert.equal(ok(password, 'longenough'), true);
    assert.equal(ok(password, 'x'.repeat(73)), false);
  });
});

describe('money and quantity', () => {
  it('accepts whole pesos and centavos', () => {
    for (const n of [0, 1, 10.5, 99.99, 999999.99]) assert.equal(ok(money, n), true, String(n));
  });

  it('rejects negatives, more than 2 decimals, too large and non-numbers', () => {
    for (const n of [-1, 0.001, 10.999, 1000000, Infinity, NaN]) assert.equal(ok(money, n), false, String(n));
    assert.equal(ok(money, '10'), false);
  });

  it('tolerates floating-point sums such as 59.99 + 60', () => {
    assert.equal(ok(money, 59.99 + 60), true);
  });

  it('limits quantity to whole numbers from 1 to 99', () => {
    assert.equal(ok(quantity, 1), true);
    assert.equal(ok(quantity, 99), true);
    for (const n of [0, -1, 1.5, 100]) assert.equal(ok(quantity, n), false, String(n));
  });
});

describe('image url', () => {
  it('accepts http(s) links only', () => {
    assert.equal(ok(imageUrl, 'https://example.com/a.jpg'), true);
    assert.equal(ok(imageUrl, 'javascript:alert(1)'), false);
    assert.equal(ok(imageUrl, 'data:image/png;base64,AAAA'), false);
    assert.equal(ok(imageUrl, `https://example.com/${'a'.repeat(2100)}`), false);
  });
});

describe('delivery address with a map pin', () => {
  const address = { line1: '12 Rizal St', city: 'Gen. Mariano Alvarez' };

  it('is valid without a pin, so existing and typed-only addresses still work', () => {
    assert.equal(ok(deliveryAddressSchema, address), true);
  });

  it('accepts a pin inside the Philippines', () => {
    assert.equal(ok(deliveryAddressSchema, { ...address, latitude: 14.2985, longitude: 120.997 }), true);
  });

  it('needs latitude and longitude together', () => {
    assert.equal(ok(deliveryAddressSchema, { ...address, latitude: 14.3 }), false);
    assert.equal(ok(deliveryAddressSchema, { ...address, longitude: 121 }), false);
  });

  it('rejects coordinates outside the Philippines, or swapped', () => {
    assert.equal(ok(deliveryAddressSchema, { ...address, latitude: 120.99, longitude: 14.29 }), false, 'swapped');
    assert.equal(ok(deliveryAddressSchema, { ...address, latitude: 40.7, longitude: -74 }), false, 'New York');
    assert.equal(ok(deliveryAddressSchema, { ...address, latitude: '14.3', longitude: '121' }), false, 'strings');
  });

  it('rejects a blank street or city', () => {
    assert.equal(ok(deliveryAddressSchema, { line1: '   ', city: 'X' }), false);
    assert.equal(ok(deliveryAddressSchema, { line1: 'X', city: '  ' }), false);
  });
});

describe('product body', () => {
  it('bounds prices, option counts and variant counts', () => {
    assert.equal(ok(productBody, { name: 'Sisig', price: 130 }), true);
    assert.equal(ok(productBody, { name: 'Sisig', price: 1e12 }), false);
    assert.equal(ok(productBody, { name: 'Sisig', price: 130.123 }), false);
    assert.equal(ok(productBody, { name: '  ', price: 130 }), false);
    assert.equal(ok(productBody, { name: 'Sisig', customizations: Array(21).fill('x') }), false);
  });
});
