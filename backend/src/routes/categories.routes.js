import { Router } from 'express';
import * as categories from '../controllers/categories.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.validators.js';
import { categoryBody } from '../validators/catalog.validators.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// One menu and price list for every branch, so only the super admin edits it.
// (A branch marks items sold out for itself through /admin/branches.)
const superAdmin = [requireAuth, requireRole('super_admin')];

router.get('/', asyncHandler(categories.list));

router.post('/', superAdmin, validate({ body: categoryBody }), asyncHandler(categories.create));

router.patch(
  '/:id',
  superAdmin,
  validate({ params: idParam, body: categoryBody.partial() }),
  asyncHandler(categories.update),
);

router.delete('/:id', superAdmin, validate({ params: idParam }), asyncHandler(categories.remove));

export default router;
