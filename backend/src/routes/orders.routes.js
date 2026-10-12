import { Router } from 'express';
import * as chat from '../controllers/chat.controller.js';
import * as orders from '../controllers/orders.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.validators.js';
import { imageBody } from '../middleware/upload.js';
import { messageBody } from '../validators/chat.validators.js';
import {
  createOnlineOrderSchema,
  gcashProofSchema,
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

// Manual GCash: upload a receipt (optional), then submit the proof for staff to verify.
router.post(
  '/:id/payment/receipt',
  validate({ params: idParam }),
  imageBody,
  asyncHandler(orders.uploadReceipt),
);
router.post(
  '/:id/payment',
  validate({ params: idParam, body: gcashProofSchema }),
  asyncHandler(orders.submitPayment),
);

router.post('/:id/cancel', validate({ params: idParam }), asyncHandler(orders.cancel));

// Chat with the rider who has the order (open only while it is out for delivery).
router.get('/:id/chat', validate({ params: idParam }), asyncHandler(chat.orderChat('customer')));
router.post(
  '/:id/chat',
  validate({ params: idParam, body: messageBody }),
  asyncHandler(chat.orderSend('customer')),
);
router.post(
  '/:id/chat/images',
  validate({ params: idParam }),
  imageBody,
  asyncHandler(chat.orderSendImage('customer')),
);

export default router;
