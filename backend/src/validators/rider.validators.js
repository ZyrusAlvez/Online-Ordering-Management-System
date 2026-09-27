import { z } from 'zod';
import { paginationQuery } from './common.validators.js';

export const riderOrdersQuery = paginationQuery.extend({
  active: z.enum(['true', 'false']).default('true'),
});

export const deliveredSchema = z.object({
  collected_amount: z.number().nonnegative().optional(),
});
