import { z } from 'zod';
import { COUNTER_FULFILLMENT, PAYMENT_METHODS } from '../constants/orders.js';
import { itemsSchema } from './common.validators.js';
import { money, optionalText, personName, requiredText } from './fields.js';
import { orderFilterQuery } from './order.validators.js';

export const posQueueQuery = orderFilterQuery.extend({
  // Free-text lookup by order number or the name the customer gave the kiosk.
  q: z.string().trim().min(1).max(120).optional(),
});

export const createWalkInOrderSchema = z.object({
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

export const voidSchema = z.object({ reason: requiredText(500, 'A reason is required') });
