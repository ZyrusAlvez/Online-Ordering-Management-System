import { z } from 'zod';
import { optionalText, quantity } from './fields.js';

export const idParam = z.object({ id: z.string().uuid() });

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** One line of a cart. Prices are never accepted from the client. */
export const orderItemSchema = z.object({
  product_id: z.string().uuid(),
  // Required when the product's price lives on a variant (e.g. size).
  variant_id: z.string().uuid().optional(),
  quantity,
  notes: optionalText(500).optional(),
});

export const itemsSchema = z
  .array(orderItemSchema)
  .min(1, 'An order needs at least one item')
  .max(50, 'An order can have at most 50 different items');
