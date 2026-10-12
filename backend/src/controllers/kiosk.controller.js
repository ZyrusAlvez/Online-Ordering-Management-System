import * as orderService from '../services/order.service.js';
import { ApiError } from '../utils/ApiError.js';

/** Scope lookups to the calling device so one kiosk cannot read another's orders. */
const getDeviceOrder = async (orderId, kioskId) => {
  const order = await orderService.fetchOrder(orderId);
  if (!order || order.kiosk_device_id !== kioskId) throw ApiError.notFound('Order not found');
  return order;
};

/**
 * Place an order from a kiosk terminal.
 *
 * Every order stays `pending` until the cashier settles it at the counter: cash
 * is handed over there, and a GCash customer pays on their phone (the kiosk
 * shows our QR) and shows the cashier the receipt.
 */
export const createOrder = async (req, res) => {
  const body = req.body;

  const order = await orderService.createOrder({
    branchId: req.kiosk.branch_id,
    items: body.items,
    channel: 'kiosk',
    fulfillmentType: body.fulfillment_type,
    customerName: body.customer_name,
    paymentMethod: body.payment_method,
    kioskDeviceId: req.kiosk.id,
    notes: body.notes ?? null,
  });

  res.status(201).json({ data: { order } });
};

/** Which device this is and the branch it orders for, for the attract screen. */
export const me = (req, res) => {
  const { id, name, branch } = req.kiosk;
  res.json({ data: { id, name, branch } });
};

/** An order this kiosk placed. */
export const getOrder = async (req, res) => {
  res.json({ data: await getDeviceOrder(req.params.id, req.kiosk.id) });
};
