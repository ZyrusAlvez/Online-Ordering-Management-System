import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  credentialsSchema,
  refreshSchema,
  registerSchema,
} from '../validators/auth.validators.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.post('/register', validate({ body: registerSchema }), asyncHandler(auth.register));
router.post('/login', validate({ body: credentialsSchema }), asyncHandler(auth.login));
router.post('/refresh', validate({ body: refreshSchema }), asyncHandler(auth.refresh));
router.post('/logout', requireAuth, asyncHandler(auth.logout));
router.get('/me', requireAuth, auth.me);

export default router;
