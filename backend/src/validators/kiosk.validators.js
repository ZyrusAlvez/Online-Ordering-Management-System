import { z } from 'zod';
import { COUNTER_FULFILLMENT, PAYMENT_METHODS } from '../constants/orders.js';
import { itemsSchema } from './common.validators.js';

export const createKioskOrderSchema = z.object({
  // A kiosk sits inside the restaurant, so it only ever produces these two.
  fulfillment_type: z.enum(COUNTER_FULFILLMENT),
  // The name is how the cashier finds the order at the counter. The order
  // number is the unambiguous lookup, but customers quote their name.
  customer_name: z.string().min(1).max(120),
  payment_method: z.enum(PAYMENT_METHODS),
  items: itemsSchema,
  notes: z.string().max(1000).optional(),
});
