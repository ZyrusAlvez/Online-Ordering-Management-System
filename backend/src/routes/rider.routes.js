import { Router } from 'express';
import * as chat from '../controllers/chat.controller.js';
import * as rider from '../controllers/rider.controller.js';
import { requireActive, requireAuth, requireRole } from '../middleware/auth.js';
import { loadBranchScope } from '../middleware/branch.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.validators.js';
import { imageBody } from '../middleware/upload.js';
import { messageBody } from '../validators/chat.validators.js';
import { deliveredSchema, riderOrdersQuery } from '../validators/rider.validators.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// A rider sees and claims only from the branch they deliver for.
router.use(requireAuth, requireRole('rider'), requireActive, loadBranchScope);

router.get('/pool', asyncHandler(rider.pool));
router.get('/orders', validate({ query: riderOrdersQuery }), asyncHandler(rider.listMine));

router.post('/orders/:id/claim', validate({ params: idParam }), asyncHandler(rider.claim));
router.post('/orders/:id/unclaim', validate({ params: idParam }), asyncHandler(rider.unclaim));
router.post(
  '/orders/:id/delivered',
  validate({ params: idParam, body: deliveredSchema }),
  asyncHandler(rider.delivered),
);

router.get('/orders/:id/chat', validate({ params: idParam }), asyncHandler(chat.orderChat('rider')));
router.post(
  '/orders/:id/chat',
  validate({ params: idParam, body: messageBody }),
  asyncHandler(chat.orderSend('rider')),
);
router.post(
  '/orders/:id/chat/images',
  validate({ params: idParam }),
  imageBody,
  asyncHandler(chat.orderSendImage('rider')),
);

export default router;
