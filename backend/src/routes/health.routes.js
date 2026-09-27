import { Router } from 'express';
import * as health from '../controllers/health.controller.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/', health.liveness);
router.get('/supabase', asyncHandler(health.readiness));

export default router;
