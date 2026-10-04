import { Router } from 'express';
import * as products from '../controllers/products.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { imageBody } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.validators.js';
import { productBody, productListQuery } from '../validators/catalog.validators.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const staff = [requireAuth, requireRole('admin', 'cashier')];
const adminOnly = [requireAuth, requireRole('admin')];

router.get('/', validate({ query: productListQuery }), asyncHandler(products.list));
router.get('/:id', validate({ params: idParam }), asyncHandler(products.get));

router.post('/', staff, validate({ body: productBody }), asyncHandler(products.create));

router.patch(
  '/:id',
  staff,
  validate({ params: idParam, body: productBody.partial() }),
  asyncHandler(products.update),
);

router.put(
  '/:id/image',
  staff,
  validate({ params: idParam }),
  imageBody,
  asyncHandler(products.setImage),
);
router.delete('/:id/image', staff, validate({ params: idParam }), asyncHandler(products.clearImage));

router.delete('/:id', adminOnly, validate({ params: idParam }), asyncHandler(products.remove));

export default router;
