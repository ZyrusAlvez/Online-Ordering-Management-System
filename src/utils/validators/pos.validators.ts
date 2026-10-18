import { z } from 'zod';
import { COUNTER_FULFILLMENT, PAYMENT_METHODS } from '@/constants/orders';
import { branchId, itemsSchema } from './common.validators';
import { money, optionalText, personName, referenceNumber, requiredText } from './fields';
import { orderFilterQuery } from './order.validators';

export const posQueueQuery = orderFilterQuery.extend({
  // Free-text lookup by order number or the name the customer gave the kiosk.
  q: z.string().trim().min(1).max(120).optional(),
});

export const createWalkInOrderSchema = z.object({
  // A cashier works at one branch and can leave this out; an admin with several must say.
  branch_id: branchId.optional(),
  fulfillment_type: z.enum(COUNTER_FULFILLMENT),
  customer_name: personName(),
  payment_method: z.enum(PAYMENT_METHODS),
  items: itemsSchema,
  notes: optionalText(1000).optional(),
});

export const replaceItemsSchema = z.object({ items: itemsSchema });

export const cashPaymentSchema = z.object({
  tendered_amount: money.optional(),
});

/** GCash shown at the counter: the cashier copies the reference number off the receipt. */
export const counterGcashSchema = z.object({ reference_number: referenceNumber });

/** Approve or reject a customer's GCash submission. A rejection tells them why. */
export const verifyGcashSchema = z
  .object({
    approve: z.boolean(),
    reason: optionalText(500).optional(),
  })
  .refine((b) => b.approve || b.reason, {
    message: 'Tell the customer why the payment was rejected',
    path: ['reason'],
  });

export const voidSchema = z.object({ reason: requiredText(500, 'A reason is required') });
