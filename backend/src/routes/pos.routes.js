import { Router } from 'express';
import * as chat from '../controllers/chat.controller.js';
import * as pos from '../controllers/pos.controller.js';
import { requireActive, requireAuth, requireRole } from '../middleware/auth.js';
import { loadBranchScope, requireOrderInScope } from '../middleware/branch.js';
import { COUNTER_ROLES } from '../constants/orders.js';
import { validate } from '../middleware/validate.js';
import { branchQuery, idParam } from '../validators/common.validators.js';
import { imageBody } from '../middleware/upload.js';
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

// Everything here is limited to the branches the caller works at.
router.use(requireAuth, requireRole(...COUNTER_ROLES), requireActive, loadBranchScope);

// An order of another branch is "not found" on every :id route.
const order = [validate({ params: idParam }), requireOrderInScope];

// --- queue ---
router.get('/orders', validate({ query: posQueueQuery }), asyncHandler(pos.listQueue));
router.get('/orders/:id', order, asyncHandler(pos.getOrder));
router.post('/orders', validate({ body: createWalkInOrderSchema }), asyncHandler(pos.createWalkIn));

// --- modify / advance ---
router.patch(
  '/orders/:id/items',
  order,
  validate({ body: replaceItemsSchema }),
  asyncHandler(pos.replaceItems),
);
router.post('/orders/:id/confirm', order, asyncHandler(pos.confirm));
router.patch('/orders/:id/status', order, validate({ body: statusBody }), asyncHandler(pos.advanceStatus));

// --- payment ---
router.post(
  '/orders/:id/payment/cash',
  order,
  validate({ body: cashPaymentSchema }),
  asyncHandler(pos.payCash),
);
router.post('/orders/:id/payment/gcash', order, asyncHandler(pos.payGcash));
router.post('/orders/:id/void', order, validate({ body: voidSchema }), asyncHandler(pos.voidOrder));

// --- chat inbox (visitors messaging from the landing page) ---
router.get('/chat/threads', validate({ query: branchQuery }), asyncHandler(chat.listThreads));
router.get('/chat/threads/:id/messages', validate({ params: idParam }), asyncHandler(chat.threadMessages));
router.post(
  '/chat/threads/:id/messages',
  validate({ params: idParam, body: messageBody }),
  asyncHandler(chat.staffSend),
);
router.post(
  '/chat/threads/:id/images',
  validate({ params: idParam }),
  imageBody,
  asyncHandler(chat.staffSendImage),
);
router.post('/chat/threads/:id/read', validate({ params: idParam }), asyncHandler(chat.markRead));

export default router;
