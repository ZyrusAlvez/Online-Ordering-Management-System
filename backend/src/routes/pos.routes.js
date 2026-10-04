import { Router } from 'express';
import * as chat from '../controllers/chat.controller.js';
import * as pos from '../controllers/pos.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.validators.js';
import { messageBody } from '../validators/chat.validators.js';
import { statusBody } from '../validators/order.validators.js';
import {
  cashPaymentSchema,
  createWalkInOrderSchema,
  posQueueQuery,
  replaceItemsSchema,
  voidSchema,
} from '../validators/pos.validators.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(requireAuth, requireRole('cashier', 'admin'));

// --- queue ---
router.get('/orders', validate({ query: posQueueQuery }), asyncHandler(pos.listQueue));
router.get('/orders/:id', validate({ params: idParam }), asyncHandler(pos.getOrder));
router.post('/orders', validate({ body: createWalkInOrderSchema }), asyncHandler(pos.createWalkIn));

// --- modify / advance ---
router.patch(
  '/orders/:id/items',
  validate({ params: idParam, body: replaceItemsSchema }),
  asyncHandler(pos.replaceItems),
);
router.post('/orders/:id/confirm', validate({ params: idParam }), asyncHandler(pos.confirm));
router.patch(
  '/orders/:id/status',
  validate({ params: idParam, body: statusBody }),
  asyncHandler(pos.advanceStatus),
);

// --- payment ---
router.post(
  '/orders/:id/payment/cash',
  validate({ params: idParam, body: cashPaymentSchema }),
  asyncHandler(pos.payCash),
);
router.post(
  '/orders/:id/payment/gcash',
  validate({ params: idParam }),
  asyncHandler(pos.payGcash),
);
router.post(
  '/orders/:id/void',
  validate({ params: idParam, body: voidSchema }),
  asyncHandler(pos.voidOrder),
);

// --- chat inbox (visitors messaging from the landing page) ---
router.get('/chat/threads', asyncHandler(chat.listThreads));
router.get('/chat/threads/:id/messages', validate({ params: idParam }), asyncHandler(chat.threadMessages));
router.post(
  '/chat/threads/:id/messages',
  validate({ params: idParam, body: messageBody }),
  asyncHandler(chat.staffSend),
);
router.post('/chat/threads/:id/read', validate({ params: idParam }), asyncHandler(chat.markRead));

export default router;
