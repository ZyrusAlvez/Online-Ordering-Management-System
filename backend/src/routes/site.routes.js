import { Router } from 'express';
import * as site from '../controllers/site.controller.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Public: the logo renders on pages that have no login.
router.get('/images', asyncHandler(site.images));

export default router;
