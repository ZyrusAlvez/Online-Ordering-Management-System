import { Router } from 'express';
import * as admin from '../controllers/admin.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.validators.js';
import {
  adminOrderQuery,
  createKioskSchema,
  createRiderSchema,
  riderListQuery,
  roleSchema,
  updateRiderSchema,
} from '../validators/admin.validators.js';
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

// --- roles ---
router.patch(
  '/users/:id/role',
  validate({ params: idParam, body: roleSchema }),
  asyncHandler(admin.setRole),
);

export default router;
