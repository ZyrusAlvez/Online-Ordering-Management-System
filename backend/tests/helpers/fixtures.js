import { db } from './db.js';
import { get, patch, post } from './client.js';
import { tokenFor } from './auth.js';

/**
 * Test data lives in the same database as everything else, so every order this
 * suite creates is tracked and deleted afterwards. Call `track()` on anything
 * you create and `cleanup()` in an `after()` hook.
 */
const created = new Set();

export const track = (orderId) => {
  if (orderId) created.add(orderId);
  return orderId;
};

export const cleanup = async () => {
  if (created.size === 0) return;
  // order_items cascade from orders.
  const { error } = await db.from('orders').delete().in('id', [...created]);
  if (error) throw error;
  created.clear();
};

const kioskDevices = new Set();

export const cleanupKiosks = async () => {
  if (kioskDevices.size === 0) return;
  await db.from('kiosk_devices').delete().in('id', [...kioskDevices]);
  kioskDevices.clear();
};

// --- menu -----------------------------------------------------------------

let menuCache = null;

/** The live menu, fetched once per test process. */
export const menu = async () => {
  if (menuCache) return menuCache;
  const res = await get('/menu');
  if (res.status !== 200) throw new Error(`Could not load menu: ${res.status}`);
  menuCache = res.body.data;
  return menuCache;
};

export const allProducts = async () => (await menu()).flatMap((c) => c.products);

/** A flat-priced product — safe to order with no variant. */
export const flatPricedProduct = async () => {
  const product = (await allProducts()).find((p) => p.price != null && p.variants.length === 0);
  if (!product) throw new Error('No flat-priced product in the menu');
  return product;
};

/** A product whose price lives on its variants (e.g. Lechon Kawali, Bilao). */
export const variantPricedProduct = async () => {
  const product = (await allProducts()).find(
    (p) => p.price == null && p.variants.some((v) => v.price != null),
  );
  if (!product) throw new Error('No variant-priced product in the menu');
  return product;
};

/** A product with no usable price anywhere — must be rejected at order time. */
export const unpricedProduct = async () => {
  const product = (await allProducts()).find(
    (p) => p.price == null && p.variants.length > 0 && p.variants.every((v) => v.price == null),
  );
  return product ?? null;
};

// --- kiosk devices --------------------------------------------------------

/** Issues a real kiosk device key via the admin API and tracks it for cleanup. */
export const issueKioskKey = async (name = `Test Kiosk ${Date.now()}`) => {
  const admin = await tokenFor('admin');
  const res = await post('/admin/kiosks', { name }, { token: admin });
  if (res.status !== 201) throw new Error(`Could not issue kiosk key: ${JSON.stringify(res.body)}`);
  kioskDevices.add(res.body.data.id);
  return res.body.data.key;
};

// --- order builders -------------------------------------------------------

/** Places a kiosk order and tracks it. Returns the order object. */
export const placeKioskOrder = async (kioskKey, overrides = {}) => {
  const product = await flatPricedProduct();
  const res = await post(
    '/kiosk/orders',
    {
      fulfillment_type: 'dine_in',
      customer_name: 'Test Customer',
      payment_method: 'cash',
      items: [{ product_id: product.id, quantity: 1 }],
      ...overrides,
    },
    { kioskKey },
  );

  if (res.status !== 201) throw new Error(`Kiosk order failed: ${JSON.stringify(res.body)}`);
  track(res.body.data.order.id);
  return res.body.data;
};

/** Places an online order as the given role and tracks it. */
export const placeOnlineOrder = async (role = 'customer', overrides = {}) => {
  const product = await flatPricedProduct();
  const token = await tokenFor(role);

  const res = await post(
    '/orders',
    {
      fulfillment_type: 'pickup',
      payment_method: 'cash',
      items: [{ product_id: product.id, quantity: 1 }],
      // Delivery needs a number the rider can call.
      ...(overrides.fulfillment_type === 'delivery' ? { customer_phone: '09171234567' } : {}),
      ...overrides,
    },
    { token },
  );

  if (res.status !== 201) throw new Error(`Online order failed: ${JSON.stringify(res.body)}`);
  track(res.body.data.id);
  return res.body.data;
};

/** Places a POS walk-in order and tracks it. */
export const placeWalkInOrder = async (overrides = {}) => {
  const product = await flatPricedProduct();
  const cashier = await tokenFor('cashier');

  const res = await post(
    '/pos/orders',
    {
      fulfillment_type: 'take_out',
      customer_name: 'Walk In',
      payment_method: 'cash',
      items: [{ product_id: product.id, quantity: 1 }],
      ...overrides,
    },
    { token: cashier },
  );

  if (res.status !== 201) throw new Error(`Walk-in order failed: ${JSON.stringify(res.body)}`);
  track(res.body.data.id);
  return res.body.data;
};

/** Drives an order to `ready` through the POS, the way a cashier would. */
export const driveToReady = async (orderId) => {
  const cashier = await tokenFor('cashier');

  const confirmed = await post(`/pos/orders/${orderId}/confirm`, undefined, { token: cashier });
  if (confirmed.status !== 200) {
    throw new Error(`Could not confirm order: ${JSON.stringify(confirmed.body)}`);
  }

  for (const status of ['preparing', 'ready']) {
    const res = await patch(`/pos/orders/${orderId}/status`, { status }, { token: cashier });
    if (res.status !== 200) {
      throw new Error(`Could not advance to ${status}: ${JSON.stringify(res.body)}`);
    }
  }
};
