import { env } from '../config/env.js';
import * as orderService from '../services/order.service.js';
import * as paymentService from '../services/payment.service.js';
import { ApiError } from '../utils/ApiError.js';

const returnUrl = (orderId) => `${env.KIOSK_RETURN_URL}?order=${orderId}`;

/** Scope lookups to the calling device so one kiosk cannot read another's orders. */
const getDeviceOrder = async (orderId, kioskId) => {
  const order = await orderService.fetchOrder(orderId);
  if (!order || order.kiosk_device_id !== kioskId) throw ApiError.notFound('Order not found');
  return order;
};

/**
 * Place an order from a kiosk terminal.
 *
 * Cash orders stay `pending` and are settled by the cashier at the counter.
 * GCash orders are paid here; the PayMongo webhook then confirms them and
 * sends them straight to the kitchen.
 */
export const createOrder = async (req, res) => {
  const body = req.body;

  const order = await orderService.createOrder({
    items: body.items,
    channel: 'kiosk',
    fulfillmentType: body.fulfillment_type,
    customerName: body.customer_name,
    paymentMethod: body.payment_method,
    kioskDeviceId: req.kiosk.id,
    notes: body.notes ?? null,
  });

  // Cash is settled at the counter and needs no payment object.
  let payment = null;

  if (body.payment_method === 'gcash') {
    try {
      payment = await paymentService.startGcashPayment(order.id, {
        returnUrl: returnUrl(order.id),
      });
    } catch (err) {
      // The order is already committed at this point. Since the response is an
      // error, the customer never learns its id — leaving it would put a
      // pending order nobody can pay for into the cashier's queue forever. Roll
      // it back so the customer can simply retry, or switch to cash.
      await orderService.discardOrder(order.id);
      throw err;
    }
  }

  res.status(201).json({ data: { order, payment } });
};

/**
 * Poll an order's state. A kiosk has no auth user, so it cannot use Supabase
 * Realtime (RLS would return it nothing) — it polls this while waiting for a
 * GCash payment to confirm.
 */
export const getOrder = async (req, res) => {
  res.json({ data: await getDeviceOrder(req.params.id, req.kiosk.id) });
};

/** Restart a GCash attempt the customer abandoned, or that failed. */
export const retryPayment = async (req, res) => {
  const order = await getDeviceOrder(req.params.id, req.kiosk.id);
  const payment = await paymentService.startGcashPayment(order.id, {
    returnUrl: returnUrl(order.id),
  });

  res.json({ data: payment });
};
