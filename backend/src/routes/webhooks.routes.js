import { Router } from 'express';
import * as webhooks from '../controllers/webhooks.controller.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.post('/paymongo', asyncHandler(webhooks.paymongo));

export default router;
