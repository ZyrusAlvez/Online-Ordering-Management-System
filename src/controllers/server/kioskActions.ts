'use server';

import { timingSafeEqual } from 'node:crypto';
import * as kioskModel from '@/models/server/kioskModel';
import { hashKioskKey } from '@/controllers/server/kioskDevices';
import { priceFromRows, toPesos } from '@/controllers/orderController';
import { getGcashAccount } from '@/controllers/siteController';
import { validate } from '@/utils/validate';
import { createKioskOrderSchema } from '@/utils/validators/kiosk.validators';
import { fail, fromDbError, ok, type Result } from '@/utils/result';

// A kiosk is a public terminal with no logged-in user. It presents a per-device key instead
// (kept in the kiosk browser's localStorage). The key identifies which terminal placed an order
// and can be revoked on its own. Only the key's hash is stored.

type Device = { id: string; name: string; branch_id: string; branch: any };

/** The port of the old requireKiosk middleware: 401 unknown key, 403 revoked. */
const requireKiosk = async (key: string | null): Promise<Result<Device>> => {
  if (!key) return fail('Kiosk key required', 401);
  const hash = hashKioskKey(key);
  const { data } = await kioskModel.getDeviceByHash(hash);
  if (!data) return fail('Unknown kiosk key', 401);
  const a = Buffer.from(data.key_hash, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return fail('Unknown kiosk key', 401);
  if (!data.is_active) return fail('This kiosk has been disabled', 403);
  await kioskModel.touchDevice(data.id);
  return ok({ id: data.id, name: data.name, branch_id: data.branch_id, branch: data.branch });
};

export async function kioskMe(key: string | null) {
  const device = await requireKiosk(key);
  if (device.success === false) return device;
  const { id, name, branch } = device.data;
  return ok({ id, name, branch });
}

/** Dine-in or take-out at the kiosk's own branch, paid at the counter. */
export async function createKioskOrder(key: string | null, input: unknown) {
  const device = await requireKiosk(key);
  if (device.success === false) return device;
  const body = validate(createKioskOrderSchema, input);
  if (body.success === false) return body;
  const b: any = body.data;
  if (b.payment_method === 'gcash' && !getGcashAccount()) return fail('GCash is not available right now; please pay in cash');

  const branchId = device.data.branch_id;
  const ids = [...new Set<string>(b.items.map((i: any) => i.product_id))];
  const [{ data: products, error }, { data: soldOut }] = await Promise.all([
    kioskModel.getProductsForPricing(ids),
    kioskModel.getSoldOutAmong(branchId, ids),
  ]);
  if (error) return fromDbError(error, 'Failed to price the order');
  const priced = priceFromRows(b.items, products ?? [], (soldOut ?? []).map((r) => r.product_id));
  if (priced.success === false) return priced;

  const { data: order, error: orderError } = await kioskModel.insertOrder({
    branch_id: branchId,
    channel: 'kiosk',
    fulfillment_type: b.fulfillment_type,
    customer_name: b.customer_name,
    payment_method: b.payment_method,
    payment_status: 'unpaid',
    status: 'pending',
    total_amount: toPesos(priced.data.totalCentavos),
    kiosk_device_id: device.data.id,
    notes: b.notes ?? null,
  });
  if (orderError) return fromDbError(orderError, 'Failed to place the order');

  const { error: itemsError } = await kioskModel.insertOrderItems(priced.data.lines.map((l) => ({ ...l, order_id: order.id })));
  if (itemsError) {
    await kioskModel.deleteOrder(order.id);
    return fromDbError(itemsError, 'Failed to place the order');
  }
  return kioskOrder(key, order.id);
}

/** The kiosk polls the order it placed; another device's order is "not found". */
export async function kioskOrder(key: string | null, orderId: string) {
  const device = await requireKiosk(key);
  if (device.success === false) return device;
  const { data, error } = await kioskModel.getDeviceOrder(orderId, device.data.id);
  if (error) return fromDbError(error);
  if (!data) return fail('Order not found', 404);
  return ok(data);
}
