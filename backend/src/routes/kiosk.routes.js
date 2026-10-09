import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as kiosk from '../controllers/kiosk.controller.js';
import { requireKiosk } from '../middleware/kiosk.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.validators.js';
import { createKioskOrderSchema } from '../validators/kiosk.validators.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// A kiosk is a public terminal, so cap how fast one device can create orders
// independently of the global limiter.
const kioskLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.kiosk?.id ?? req.ip,
});

router.use(requireKiosk);

router.get('/me', kiosk.me);

router.post(
  '/orders',
  kioskLimiter,
  validate({ body: createKioskOrderSchema }),
  asyncHandler(kiosk.createOrder),
);

router.get('/orders/:id', validate({ params: idParam }), asyncHandler(kiosk.getOrder));

router.post(
  '/orders/:id/payment',
  kioskLimiter,
  validate({ params: idParam }),
  asyncHandler(kiosk.retryPayment),
);

export default router;
