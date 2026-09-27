import { Router } from 'express';
import * as menu from '../controllers/menu.controller.js';
import { validate } from '../middleware/validate.js';
import { menuQuery } from '../validators/menu.validators.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/', validate({ query: menuQuery }), asyncHandler(menu.getMenu));

export default router;
