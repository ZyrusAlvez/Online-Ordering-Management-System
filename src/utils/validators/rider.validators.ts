import { z } from 'zod';
import { paginationQuery } from './common.validators';
import { money } from './fields';

export const riderOrdersQuery = paginationQuery.extend({
  active: z.enum(['true', 'false']).default('true'),
});

export const deliveredSchema = z.object({
  collected_amount: money.optional(),
});
