import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as employee from '../controllers/employee.controller.js';
import { validate } from '../middleware/validate.js';
import { employeeLoginSchema, kioskUnlockSchema } from '../validators/employee.validators.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Both endpoints accept a guessable shared password, so brute-forcing has to be
// slow regardless of the global limiter. Each gets its own budget, and only
// wrong guesses count: several registers behind one shop router must not lock
// each other out just by logging in correctly.
const gateLimiter = () =>
  rateLimit({
    windowMs: 15 * 60_000,
    max: 10,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { message: 'Too many attempts. Try again later.' } },
  });
const cashierLimiter = gateLimiter();
const kioskLimiter = gateLimiter();

router.post(
  '/cashier/login',
  cashierLimiter,
  validate({ body: employeeLoginSchema }),
  asyncHandler(employee.cashierLogin),
);

router.post(
  '/kiosk/unlock',
  kioskLimiter,
  validate({ body: kioskUnlockSchema }),
  asyncHandler(employee.kioskUnlock),
);

export default router;
