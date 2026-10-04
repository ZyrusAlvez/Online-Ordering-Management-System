import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as chat from '../controllers/chat.controller.js';
import { imageBody } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.validators.js';
import { createVisitorThreadSchema, messageBody } from '../validators/chat.validators.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Anyone can reach these without an account, so each limit is much tighter than the
// global one. Opening threads is the expensive abuse (each is a row the cashier sees).
const limit = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { message } },
  });

const openThreadLimiter = limit(60 * 60_000, 5, 'Too many conversations started. Try again later.');
const sendLimiter = limit(60_000, 20, 'You are sending messages too fast.');
// Photos are the heavy part (up to 5 MB each, stored), so they get a tighter budget.
const imageLimiter = limit(10 * 60_000, 10, 'You are sending photos too fast. Try again in a few minutes.');

router.post(
  '/visitor/threads',
  openThreadLimiter,
  validate({ body: createVisitorThreadSchema }),
  asyncHandler(chat.createVisitorThread),
);

router.get(
  '/visitor/threads/:id/messages',
  validate({ params: idParam }),
  asyncHandler(chat.visitorMessages),
);

router.post(
  '/visitor/threads/:id/messages',
  sendLimiter,
  validate({ params: idParam, body: messageBody }),
  asyncHandler(chat.visitorSend),
);

router.post(
  '/visitor/threads/:id/images',
  imageLimiter,
  validate({ params: idParam }),
  imageBody,
  asyncHandler(chat.visitorSendImage),
);

export default router;
