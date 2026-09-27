import { z } from 'zod';
import { COUNTER_FULFILLMENT, PAYMENT_METHODS } from '../constants/orders.js';
import { itemsSchema } from './common.validators.js';
import { orderFilterQuery } from './order.validators.js';

export const posQueueQuery = orderFilterQuery.extend({
  // Free-text lookup by order number or the name the customer gave the kiosk.
  q: z.string().trim().min(1).max(120).optional(),
});

export const createWalkInOrderSchema = z.object({
  fulfillment_type: z.enum(COUNTER_FULFILLMENT),
  customer_name: z.string().min(1).max(120),
  payment_method: z.enum(PAYMENT_METHODS),
  items: itemsSchema,
  notes: z.string().max(1000).optional(),
});

export const replaceItemsSchema = z.object({ items: itemsSchema });

export const cashPaymentSchema = z.object({
  tendered_amount: z.number().nonnegative().optional(),
});

export const voidSchema = z.object({ reason: z.string().min(1).max(500) });
