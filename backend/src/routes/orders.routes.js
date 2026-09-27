import { Router } from 'express';
import * as orders from '../controllers/orders.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.validators.js';
import {
  createOnlineOrderSchema,
  myOrdersQuery,
} from '../validators/order.validators.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// The online customer's own orders. Every route is authenticated, and reads
// go through the caller-scoped client so RLS narrows rows to them.
router.use(requireAuth);

router.get('/', validate({ query: myOrdersQuery }), asyncHandler(orders.listMine));
router.get('/:id', validate({ params: idParam }), asyncHandler(orders.getMine));

router.post('/', validate({ body: createOnlineOrderSchema }), asyncHandler(orders.create));
router.post('/:id/payment', validate({ params: idParam }), asyncHandler(orders.startPayment));
router.post('/:id/cancel', validate({ params: idParam }), asyncHandler(orders.cancel));

export default router;
