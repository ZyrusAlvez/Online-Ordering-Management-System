import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { idParam, itemsSchema, paginationQuery } from '../../src/validators/common.validators.js';
import { registerSchema } from '../../src/validators/auth.validators.js';
import { createOnlineOrderSchema } from '../../src/validators/order.validators.js';
import { createKioskOrderSchema } from '../../src/validators/kiosk.validators.js';
import { updateRiderSchema } from '../../src/validators/admin.validators.js';

const UUID = '00000000-0000-4000-8000-000000000000';

describe('paginationQuery', () => {
  it('defaults page and limit when absent', () => {
    assert.deepEqual(paginationQuery.parse({}), { page: 1, limit: 20 });
  });

  it('coerces numeric strings, since query params are always strings', () => {
    assert.deepEqual(paginationQuery.parse({ page: '3', limit: '50' }), { page: 3, limit: 50 });
  });

  it('rejects a limit above the cap', () => {
    assert.equal(paginationQuery.safeParse({ limit: '101' }).success, false);
  });

  it('rejects page zero and negatives', () => {
    assert.equal(paginationQuery.safeParse({ page: '0' }).success, false);
    assert.equal(paginationQuery.safeParse({ page: '-1' }).success, false);
  });

  it('rejects a fractional page', () => {
    assert.equal(paginationQuery.safeParse({ page: '1.5' }).success, false);
  });
});

describe('idParam', () => {
  it('accepts a uuid', () => {
    assert.equal(idParam.safeParse({ id: UUID }).success, true);
  });

  it('rejects a non-uuid, so a bad path cannot reach the database', () => {
    assert.equal(idParam.safeParse({ id: 'not-a-uuid' }).success, false);
    assert.equal(idParam.safeParse({ id: '123' }).success, false);
  });
});

describe('itemsSchema', () => {
  it('accepts a minimal line', () => {
    assert.equal(itemsSchema.safeParse([{ product_id: UUID, quantity: 1 }]).success, true);
  });

  it('rejects an empty cart', () => {
    const result = itemsSchema.safeParse([]);
    assert.equal(result.success, false);
    assert.match(result.error.issues[0].message, /at least one item/);
  });

  it('rejects zero and negative quantities', () => {
    assert.equal(itemsSchema.safeParse([{ product_id: UUID, quantity: 0 }]).success, false);
    assert.equal(itemsSchema.safeParse([{ product_id: UUID, quantity: -2 }]).success, false);
  });

  it('rejects a fractional quantity', () => {
    assert.equal(itemsSchema.safeParse([{ product_id: UUID, quantity: 1.5 }]).success, false);
  });

  it('ignores a client-supplied price — the server always prices the order', () => {
    const parsed = itemsSchema.parse([{ product_id: UUID, quantity: 1, unit_price: 1 }]);
    assert.equal('unit_price' in parsed[0], false);
  });
});

describe('registerSchema', () => {
  it('requires a plausible email', () => {
    assert.equal(registerSchema.safeParse({ email: 'nope', password: 'abcd1234' }).success, false);
  });

  it('enforces a minimum password length', () => {
    const result = registerSchema.safeParse({ email: 'a@b.co', password: 'short' });
    assert.equal(result.success, false);
    assert.match(result.error.issues[0].message, /at least 8/);
  });

  it('has no role field, so a signup cannot request staff access', () => {
    const parsed = registerSchema.parse({
      email: 'a@b.co',
      password: 'abcd1234',
      role: 'admin',
    });
    assert.equal('role' in parsed, false);
  });
});

describe('createOnlineOrderSchema', () => {
  const base = {
    payment_method: 'cash',
    items: [{ product_id: UUID, quantity: 1 }],
  };
  const address = { line1: '1 Main St', city: 'Davao City' };

  it('accepts pickup without an address', () => {
    assert.equal(
      createOnlineOrderSchema.safeParse({ ...base, fulfillment_type: 'pickup' }).success,
      true,
    );
  });

  it('requires an address for delivery, naming the field', () => {
    const result = createOnlineOrderSchema.safeParse({ ...base, fulfillment_type: 'delivery' });
    assert.equal(result.success, false);
    assert.deepEqual(result.error.flatten().fieldErrors.delivery_address, [
      'delivery_address is required when fulfillment_type is "delivery"',
    ]);
  });

  it('accepts delivery with an address', () => {
    assert.equal(
      createOnlineOrderSchema.safeParse({
        ...base,
        fulfillment_type: 'delivery',
        delivery_address: address,
      }).success,
      true,
    );
  });

  it('rejects counter fulfillment types — those belong to the kiosk and POS', () => {
    for (const type of ['dine_in', 'take_out']) {
      assert.equal(
        createOnlineOrderSchema.safeParse({ ...base, fulfillment_type: type }).success,
        false,
        `${type} should not be orderable online`,
      );
    }
  });

  it('rejects an unknown payment method', () => {
    assert.equal(
      createOnlineOrderSchema.safeParse({
        ...base,
        fulfillment_type: 'pickup',
        payment_method: 'bitcoin',
      }).success,
      false,
    );
  });

  it('requires a city and street line in the address', () => {
    const result = createOnlineOrderSchema.safeParse({
      ...base,
      fulfillment_type: 'delivery',
      delivery_address: { line1: '' },
    });
    assert.equal(result.success, false);
  });
});

describe('createKioskOrderSchema', () => {
  const base = {
    customer_name: 'Ana',
    payment_method: 'cash',
    items: [{ product_id: UUID, quantity: 1 }],
  };

  it('accepts dine_in and take_out', () => {
    for (const type of ['dine_in', 'take_out']) {
      assert.equal(createKioskOrderSchema.safeParse({ ...base, fulfillment_type: type }).success, true);
    }
  });

  it('rejects delivery and pickup — a kiosk is inside the restaurant', () => {
    for (const type of ['delivery', 'pickup']) {
      assert.equal(
        createKioskOrderSchema.safeParse({ ...base, fulfillment_type: type }).success,
        false,
      );
    }
  });

  it('requires a customer name, since that is how the cashier finds the order', () => {
    const result = createKioskOrderSchema.safeParse({
      ...base,
      fulfillment_type: 'dine_in',
      customer_name: '',
    });
    assert.equal(result.success, false);
  });
});

describe('updateRiderSchema', () => {
  it('accepts a single field', () => {
    assert.equal(updateRiderSchema.safeParse({ is_active: false }).success, true);
  });

  it('rejects an empty body rather than issuing a no-op update', () => {
    const result = updateRiderSchema.safeParse({});
    assert.equal(result.success, false);
    assert.deepEqual(result.error.flatten().formErrors, ['Nothing to update']);
  });
});
