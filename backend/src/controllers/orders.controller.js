import * as branchService from '../services/branch.service.js';
import * as orderService from '../services/order.service.js';
import * as paymentService from '../services/payment.service.js';
import { ApiError } from '../utils/ApiError.js';
import { assertOrderTime } from '../utils/schedule.js';
import { buildMeta } from '../utils/pagination.js';

/**
 * The signed-in customer's own orders. Reads go through req.supabase so RLS
 * narrows rows to the caller rather than the app filtering by hand.
 */
export const listMine = async (req, res) => {
  const { page, limit, status } = req.query;
  const { data, total } = await orderService.listOrders({
    client: req.supabase,
    page,
    limit,
    status,
  });

  res.json({ data, meta: buildMeta({ page, limit, total }) });
};

export const getMine = async (req, res) => {
  const data = await orderService.fetchOrder(req.params.id, req.supabase);
  if (!data) throw ApiError.notFound('Order not found');

  res.json({ data });
};

export const create = async (req, res) => {
  const body = req.body;
  const branch = await branchService.getActiveBranchOrFail(body.branch_id);
  assertOrderTime(branch, body.scheduled_for ?? null);

  const data = await orderService.createOrder({
    branchId: branch.id,
    items: body.items,
    channel: 'online',
    fulfillmentType: body.fulfillment_type,
    customerId: req.user.id,
    customerName: req.user.user_metadata?.full_name ?? null,
    customerPhone: body.customer_phone ?? null,
    paymentMethod: body.payment_method,
    deliveryAddress: body.fulfillment_type === 'delivery' ? body.delivery_address : null,
    notes: body.notes ?? null,
    scheduledFor: body.scheduled_for ? new Date(body.scheduled_for).toISOString() : null,
  });

  res.status(201).json({ data });
};

export const startPayment = async (req, res) => {
  // Read through the caller-scoped client first so RLS confirms ownership
  // before the payment service touches the order with the secret key.
  const owned = await orderService.fetchOrder(req.params.id, req.supabase);
  if (!owned) throw ApiError.notFound('Order not found');

  res.json({ data: await paymentService.startGcashPayment(req.params.id) });
};

export const cancel = async (req, res) => {
  res.json({ data: await orderService.cancelOwnOrder(req.params.id, req.user.id) });
};
