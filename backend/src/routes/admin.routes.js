import { Router } from 'express';
import * as admin from '../controllers/admin.controller.js';
import { ADMIN_ROLES } from '../constants/orders.js';
import { requireActive, requireAuth, requireRole } from '../middleware/auth.js';
import { loadBranchScope, requireOrderInScope } from '../middleware/branch.js';
import { imageBody } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.validators.js';
import {
  adminListQuery,
  adminOrderQuery,
  createAdminSchema,
  createKioskSchema,
  createRiderSchema,
  kioskListQuery,
  riderListQuery,
  roleSchema,
  salesQuery,
  siteImageKeyParam,
  updateAdminSchema,
  updateRiderSchema,
} from '../validators/admin.validators.js';
import { employeePasswordSchema, employeeRoleParam } from '../validators/employee.validators.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Admins see only the branches they are assigned to; a super admin sees all.
router.use(requireAuth, requireRole(...ADMIN_ROLES), requireActive, loadBranchScope);

// What is shared by every branch is the super admin's alone.
const superAdmin = requireRole('super_admin');

// --- orders oversight ---
router.get('/orders', validate({ query: adminOrderQuery }), asyncHandler(admin.listOrders));
router.post(
  '/orders/:id/refund/retry',
  validate({ params: idParam }),
  requireOrderInScope,
  asyncHandler(admin.retryRefund),
);

// --- sales report (paid, non-voided orders by Manila day) ---
router.get('/sales', validate({ query: salesQuery }), asyncHandler(admin.salesReport));

// --- riders (created by admin, never self-registered) ---
router.get('/riders', validate({ query: riderListQuery }), asyncHandler(admin.listRiders));
router.post('/riders', validate({ body: createRiderSchema }), asyncHandler(admin.createRider));
router.patch(
  '/riders/:id',
  validate({ params: idParam, body: updateRiderSchema }),
  asyncHandler(admin.updateRider),
);

// --- kiosk devices ---
router.get('/kiosks', validate({ query: kioskListQuery }), asyncHandler(admin.listKiosks));
router.post('/kiosks', validate({ body: createKioskSchema }), asyncHandler(admin.createKiosk));
router.delete('/kiosks/:id', validate({ params: idParam }), asyncHandler(admin.revokeKiosk));

// --- employee gate passwords (/cashier and /kiosk), per branch ---
router.put(
  '/employee-passwords/:role',
  validate({ params: employeeRoleParam, body: employeePasswordSchema }),
  asyncHandler(admin.setEmployeePassword),
);

// --- admin accounts (super admin) ---
router.get('/admins', superAdmin, validate({ query: adminListQuery }), asyncHandler(admin.listAdmins));
router.post('/admins', superAdmin, validate({ body: createAdminSchema }), asyncHandler(admin.createAdmin));
router.patch(
  '/admins/:id',
  superAdmin,
  validate({ params: idParam, body: updateAdminSchema }),
  asyncHandler(admin.updateAdmin),
);

// --- site images (logo, promo; super admin) ---
router.put(
  '/site-images/:key',
  superAdmin,
  validate({ params: siteImageKeyParam }),
  imageBody,
  asyncHandler(admin.setSiteImage),
);
router.delete(
  '/site-images/:key',
  superAdmin,
  validate({ params: siteImageKeyParam }),
  asyncHandler(admin.clearSiteImage),
);

// --- roles (super admin) ---
router.patch(
  '/users/:id/role',
  superAdmin,
  validate({ params: idParam, body: roleSchema }),
  asyncHandler(admin.setRole),
);

export default router;
