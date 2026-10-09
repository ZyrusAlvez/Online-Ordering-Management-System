import { Router } from 'express';
import * as products from '../controllers/products.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { imageBody } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.validators.js';
import { productBody, productListQuery } from '../validators/catalog.validators.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// One menu and price list for every branch, so only the super admin edits it.
// (A branch marks items sold out for itself through /admin/branches.)
const superAdmin = [requireAuth, requireRole('super_admin')];

router.get('/', validate({ query: productListQuery }), asyncHandler(products.list));
router.get('/:id', validate({ params: idParam }), asyncHandler(products.get));

router.post('/', superAdmin, validate({ body: productBody }), asyncHandler(products.create));

router.patch(
  '/:id',
  superAdmin,
  validate({ params: idParam, body: productBody.partial() }),
  asyncHandler(products.update),
);

router.put(
  '/:id/image',
  superAdmin,
  validate({ params: idParam }),
  imageBody,
  asyncHandler(products.setImage),
);
router.delete('/:id/image', superAdmin, validate({ params: idParam }), asyncHandler(products.clearImage));

router.delete('/:id', superAdmin, validate({ params: idParam }), asyncHandler(products.remove));

export default router;
