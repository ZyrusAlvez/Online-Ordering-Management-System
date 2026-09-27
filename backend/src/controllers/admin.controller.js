import * as kioskDeviceService from '../services/kioskDevice.service.js';
import * as orderService from '../services/order.service.js';
import * as paymentService from '../services/payment.service.js';
import * as profileService from '../services/profile.service.js';
import { buildMeta } from '../utils/pagination.js';

// --- Orders ----------------------------------------------------------------
export const listOrders = async (req, res) => {
  const { page, limit, status, payment_status: paymentStatus, channel, from, to } = req.query;
  const { data, total } = await orderService.listOrders({
    page,
    limit,
    status,
    paymentStatus,
    channel,
    createdAfter: from,
    createdBefore: to,
  });

  res.json({ data, meta: buildMeta({ page, limit, total }) });
};

/** Retry a refund PayMongo rejected, which left the order in refund_failed. */
export const retryRefund = async (req, res) => {
  const refund = await paymentService.refundOrder(req.params.id, 'others');
  res.json({ data: { refund_id: refund.id, status: refund.attributes?.status ?? 'pending' } });
};

// --- Riders ----------------------------------------------------------------
export const listRiders = async (req, res) => {
  const { page, limit } = req.query;
  const { data, total } = await profileService.listProfiles({ role: 'rider', page, limit });

  res.json({ data, meta: buildMeta({ page, limit, total }) });
};

export const createRider = async (req, res) => {
  const data = await profileService.createStaffUser({
    email: req.body.email,
    password: req.body.password,
    role: 'rider',
    fullName: req.body.full_name,
    phone: req.body.phone,
  });

  res.status(201).json({ data });
};

export const updateRider = async (req, res) => {
  res.json({ data: await profileService.updateRider(req.params.id, req.body) });
};

// --- Kiosk devices ---------------------------------------------------------
export const listKiosks = async (_req, res) => {
  res.json({ data: await kioskDeviceService.listKioskDevices() });
};

export const createKiosk = async (req, res) => {
  res.status(201).json({ data: await kioskDeviceService.issueKioskDevice(req.body.name) });
};

export const revokeKiosk = async (req, res) => {
  await kioskDeviceService.revokeKioskDevice(req.params.id);
  res.status(204).send();
};

// --- Roles -----------------------------------------------------------------
export const setRole = async (req, res) => {
  res.json({ data: await profileService.setUserRole(req.params.id, req.body.role) });
};
