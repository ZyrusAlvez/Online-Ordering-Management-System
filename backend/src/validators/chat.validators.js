import { z } from 'zod';
import { branchId } from './common.validators.js';

export const messageBody = z.object({ body: z.string().trim().min(1).max(1000) });

export const createVisitorThreadSchema = messageBody.extend({
  // The branch the visitor is looking at; that branch's cashier answers.
  branch_id: branchId,
  name: z.string().trim().min(1).max(60).optional(),
});
