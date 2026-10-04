import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as auth from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  changePasswordSchema,
  credentialsSchema,
  refreshSchema,
  registerSchema,
  updateProfileSchema,
} from '../validators/auth.validators.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// The current password is re-checked on every attempt, so a stolen session
// could otherwise be used to guess it.
const passwordLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip,
  message: { error: { message: 'Too many attempts. Try again later.' } },
});

router.post('/register', validate({ body: registerSchema }), asyncHandler(auth.register));
router.post('/login', validate({ body: credentialsSchema }), asyncHandler(auth.login));
router.post('/refresh', validate({ body: refreshSchema }), asyncHandler(auth.refresh));
router.post('/logout', requireAuth, asyncHandler(auth.logout));
router.get('/me', requireAuth, auth.me);

router.get('/profile', requireAuth, asyncHandler(auth.getProfile));
router.patch(
  '/profile',
  requireAuth,
  validate({ body: updateProfileSchema }),
  asyncHandler(auth.updateProfile),
);
router.post(
  '/password',
  requireAuth,
  passwordLimiter,
  validate({ body: changePasswordSchema }),
  asyncHandler(auth.changePassword),
);

export default router;
