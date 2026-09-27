import { z } from 'zod';
import { paginationQuery } from './common.validators.js';

export const categoryBody = z.object({
  name: z.string().min(1).max(100),
  sort_order: z.number().int().default(0).optional(),
});

export const productListQuery = paginationQuery.extend({
  search: z.string().trim().min(1).optional(),
  category_id: z.string().uuid().optional(),
  available: z.enum(['true', 'false']).optional(),
});

const variantSchema = z.object({
  label: z.string().min(1).max(100),
  price: z.number().nonnegative().nullable().optional(),
  sort_order: z.number().int().default(0).optional(),
});

export const productBody = z.object({
  category_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  // Null/omitted when pricing lives on variants, or isn't set yet.
  price: z.number().nonnegative().nullable().optional(),
  image_url: z.string().url().optional(),
  is_available: z.boolean().default(true),
  customizations: z.array(z.string().min(1).max(100)).default([]),
  sort_order: z.number().int().default(0).optional(),
  // When provided, replaces the product's full variant list.
  variants: z.array(variantSchema).optional(),
});
