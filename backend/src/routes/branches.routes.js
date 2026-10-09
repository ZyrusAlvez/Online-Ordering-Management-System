import { Router } from 'express';
import * as branches from '../controllers/branches.controller.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Public: the landing map and the branch pickers need it before anyone logs in.
router.get('/', asyncHandler(branches.list));

export default router;
