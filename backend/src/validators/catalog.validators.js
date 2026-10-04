import { z } from 'zod';
import { paginationQuery } from './common.validators.js';
import { imageUrl, money, optionalText, personName, sortOrder } from './fields.js';

export const categoryBody = z.object({
  name: personName(100),
  sort_order: sortOrder.default(0).optional(),
});

export const productListQuery = paginationQuery.extend({
  search: z.string().trim().min(1).max(120).optional(),
  category_id: z.string().uuid().optional(),
  available: z.enum(['true', 'false']).optional(),
});

const variantSchema = z.object({
  label: personName(100),
  price: money.nullable().optional(),
  sort_order: sortOrder.default(0).optional(),
});

export const productBody = z.object({
  category_id: z.string().uuid().nullable().optional(),
  name: personName(200),
  description: optionalText(2000).optional(),
  // Null/omitted when pricing lives on variants, or isn't set yet.
  price: money.nullable().optional(),
  // null clears the image. Uploaded files go through PUT /products/:id/image.
  image_url: imageUrl.nullable().optional(),
  is_available: z.boolean().default(true),
  customizations: z.array(personName(100)).max(20).default([]),
  sort_order: sortOrder.default(0).optional(),
  // When provided, replaces the product's full variant list.
  variants: z.array(variantSchema).max(30).optional(),
});
