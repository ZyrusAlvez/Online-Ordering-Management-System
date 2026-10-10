import * as branchService from '../services/branch.service.js';
import * as employeeService from '../services/employee.service.js';
import * as kioskDeviceService from '../services/kioskDevice.service.js';
import * as orderService from '../services/order.service.js';
import * as paymentService from '../services/payment.service.js';
import * as profileService from '../services/profile.service.js';
import * as salesService from '../services/sales.service.js';
import * as siteService from '../services/site.service.js';
import { assertBranchAccess, branchFilter } from '../utils/branchScope.js';
import { buildMeta } from '../utils/pagination.js';

// --- Orders ----------------------------------------------------------------
export const listOrders = async (req, res) => {
  const { page, limit, status, payment_status: paymentStatus, channel, from, to } = req.query;
  const { data, total } = await orderService.listOrders({
    branchIds: branchFilter(req.branchScope, req.query.branch_id),
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
  const { data, total } = await profileService.listProfiles({
    roles: ['rider'],
    branchIds: branchFilter(req.branchScope, req.query.branch_id),
    page,
    limit,
  });

  res.json({ data, meta: buildMeta({ page, limit, total }) });
};

export const createRider = async (req, res) => {
  assertBranchAccess(req.branchScope, req.body.branch_id);

  const data = await profileService.createRider({
    branchId: req.body.branch_id,
    email: req.body.email,
    password: req.body.password,
    fullName: req.body.full_name,
    phone: req.body.phone,
  });

  res.status(201).json({ data });
};

export const updateRider = async (req, res) => {
  res.json({ data: await profileService.updateRider(req.params.id, req.body, req.branchScope) });
};

// --- Kiosk devices ---------------------------------------------------------
export const listKiosks = async (req, res) => {
  const branchIds = branchFilter(req.branchScope, req.query.branch_id);
  res.json({ data: await kioskDeviceService.listKioskDevices({ branchIds }) });
};

export const createKiosk = async (req, res) => {
  assertBranchAccess(req.branchScope, req.body.branch_id);
  res.status(201).json({ data: await kioskDeviceService.issueKioskDevice(req.body.name, req.body.branch_id) });
};

export const revokeKiosk = async (req, res) => {
  await kioskDeviceService.revokeKioskDevice(req.params.id, { branchIds: branchFilter(req.branchScope) });
  res.status(204).send();
};

// --- Employee gate passwords (per branch) ----------------------------------
export const setEmployeePassword = async (req, res) => {
  const { role } = req.params;
  const { password, branch_id: branchId } = req.body;
  assertBranchAccess(req.branchScope, branchId);

  if (role === 'cashier') await employeeService.setCashierPassword(branchId, password);
  else await employeeService.setKioskPassword(branchId, password, req.user.id);

  res.status(204).send();
};

// --- Sales report ----------------------------------------------------------
export const salesReport = async (req, res) => {
  const { branch_id: branchId, ...range } = req.query;
  const data = await salesService.getSalesReport({
    ...range,
    branchIds: branchFilter(req.branchScope, branchId),
  });
  res.json({ data });
};

// --- Branches (super admin) -------------------------------------------------
/** Every branch, including deactivated ones, for the management screen. */
export const listBranches = async (_req, res) => {
  res.json({ data: await branchService.listBranches({ activeOnly: false }) });
};

export const createBranch = async (req, res) => {
  res.status(201).json({ data: await branchService.createBranch(req.body) });
};

export const updateBranch = async (req, res) => {
  res.json({ data: await branchService.updateBranch(req.params.id, req.body) });
};

// --- Sold out at a branch (any admin of that branch) ------------------------
export const markSoldOut = (soldOut) => async (req, res) => {
  assertBranchAccess(req.branchScope, req.params.id);
  await branchService.setSoldOut(req.params.id, req.params.productId, soldOut);
  res.status(204).send();
};

// --- Admin accounts (super admin) ------------------------------------------
export const listAdmins = async (req, res) => {
  const { page, limit } = req.query;
  const { data, total } = await profileService.listAdmins({ page, limit });

  res.json({ data, meta: buildMeta({ page, limit, total }) });
};

export const createAdmin = async (req, res) => {
  const data = await profileService.createAdmin({
    branchIds: req.body.branch_ids,
    email: req.body.email,
    password: req.body.password,
    fullName: req.body.full_name,
    phone: req.body.phone,
  });

  res.status(201).json({ data });
};

export const updateAdmin = async (req, res) => {
  res.json({ data: await profileService.updateAdmin(req.params.id, req.body) });
};

// --- Site images (the logo) -------------------------------------------------
export const setSiteImage = async (req, res) => {
  res.json({ data: await siteService.setSiteImage(req.params.key, req.body) });
};

export const clearSiteImage = async (req, res) => {
  res.json({ data: await siteService.clearSiteImage(req.params.key) });
};

// --- Roles -----------------------------------------------------------------
export const setRole = async (req, res) => {
  res.json({ data: await profileService.setUserRole(req.params.id, req.body.role) });
};
