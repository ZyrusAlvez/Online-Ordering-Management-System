import { z } from 'zod';

export const menuQuery = z.object({
  // POS and admin screens need to see sold-out items in order to re-enable
  // them; customer-facing surfaces should not.
  include_unavailable: z.enum(['true', 'false']).default('false'),
});
