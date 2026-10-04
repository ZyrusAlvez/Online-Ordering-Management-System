import { Router } from 'express';
import * as admin from '../controllers/admin.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { imageBody } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.validators.js';
import {
  adminOrderQuery,
  createKioskSchema,
  createRiderSchema,
  riderListQuery,
  roleSchema,
  salesQuery,
  siteImageKeyParam,
  updateRiderSchema,
} from '../validators/admin.validators.js';
import { employeePasswordSchema, employeeRoleParam } from '../validators/employee.validators.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(requireAuth, requireRole('admin'));

// --- orders oversight ---
router.get('/orders', validate({ query: adminOrderQuery }), asyncHandler(admin.listOrders));
router.post(
  '/orders/:id/refund/retry',
  validate({ params: idParam }),
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
router.get('/kiosks', asyncHandler(admin.listKiosks));
router.post('/kiosks', validate({ body: createKioskSchema }), asyncHandler(admin.createKiosk));
router.delete('/kiosks/:id', validate({ params: idParam }), asyncHandler(admin.revokeKiosk));

// --- employee gate passwords (/cashier and /kiosk) ---
router.put(
  '/employee-passwords/:role',
  validate({ params: employeeRoleParam, body: employeePasswordSchema }),
  asyncHandler(admin.setEmployeePassword),
);

// --- site images (logo, promo) ---
router.put(
  '/site-images/:key',
  validate({ params: siteImageKeyParam }),
  imageBody,
  asyncHandler(admin.setSiteImage),
);
router.delete(
  '/site-images/:key',
  validate({ params: siteImageKeyParam }),
  asyncHandler(admin.clearSiteImage),
);

// --- roles ---
router.patch(
  '/users/:id/role',
  validate({ params: idParam, body: roleSchema }),
  asyncHandler(admin.setRole),
);

export default router;
