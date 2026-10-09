import { z } from 'zod';
import { branchId } from './common.validators.js';

export const menuQuery = z.object({
  // POS and admin screens need to see sold-out items in order to re-enable
  // them; customer-facing surfaces should not.
  include_unavailable: z.enum(['true', 'false']).default('false'),
  // The branch whose sold-out items to hide (or mark, with include_unavailable).
  branch_id: branchId.optional(),
});
