import { z } from 'zod';

export const messageBody = z.object({ body: z.string().trim().min(1).max(1000) });

export const createVisitorThreadSchema = messageBody.extend({
  name: z.string().trim().min(1).max(60).optional(),
});
