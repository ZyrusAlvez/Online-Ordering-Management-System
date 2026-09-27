import { Router } from 'express';
import * as categories from '../controllers/categories.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.validators.js';
import { categoryBody } from '../validators/catalog.validators.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const staff = [requireAuth, requireRole('admin', 'cashier')];
const adminOnly = [requireAuth, requireRole('admin')];

router.get('/', asyncHandler(categories.list));

router.post('/', staff, validate({ body: categoryBody }), asyncHandler(categories.create));

router.patch(
  '/:id',
  staff,
  validate({ params: idParam, body: categoryBody.partial() }),
  asyncHandler(categories.update),
);

router.delete('/:id', adminOnly, validate({ params: idParam }), asyncHandler(categories.remove));

export default router;
