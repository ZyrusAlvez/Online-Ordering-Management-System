import { Router } from 'express';
import * as rider from '../controllers/rider.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.validators.js';
import { deliveredSchema, riderOrdersQuery } from '../validators/rider.validators.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(requireAuth, requireRole('rider'));

router.get('/pool', asyncHandler(rider.pool));
router.get('/orders', validate({ query: riderOrdersQuery }), asyncHandler(rider.listMine));

router.post('/orders/:id/claim', validate({ params: idParam }), asyncHandler(rider.claim));
router.post('/orders/:id/unclaim', validate({ params: idParam }), asyncHandler(rider.unclaim));
router.post(
  '/orders/:id/delivered',
  validate({ params: idParam, body: deliveredSchema }),
  asyncHandler(rider.delivered),
);

export default router;
