import { z } from 'zod';
import {
  CHANNELS,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  REMOTE_FULFILLMENT,
} from '../constants/orders.js';
import { itemsSchema, paginationQuery } from './common.validators.js';

export const deliveryAddressSchema = z.object({
  line1: z.string().min(1).max(300),
  barangay: z.string().max(120).optional(),
  city: z.string().min(1).max(120),
  landmark: z.string().max(300).optional(),
  notes: z.string().max(500).optional(),
});

export const myOrdersQuery = paginationQuery.extend({
  status: z.enum(ORDER_STATUSES).optional(),
});

export const createOnlineOrderSchema = z
  .object({
    // The online app is the only channel that delivers or is picked up.
    fulfillment_type: z.enum(REMOTE_FULFILLMENT),
    payment_method: z.enum(PAYMENT_METHODS),
    delivery_address: deliveryAddressSchema.optional(),
    customer_phone: z.string().min(7).max(20).optional(),
    items: itemsSchema,
    notes: z.string().max(1000).optional(),
  })
  .refine((body) => body.fulfillment_type !== 'delivery' || body.delivery_address, {
    message: 'delivery_address is required when fulfillment_type is "delivery"',
    path: ['delivery_address'],
  });

export const statusBody = z.object({ status: z.enum(ORDER_STATUSES) });

/** Filters shared by the POS queue and the admin order list. */
export const orderFilterQuery = paginationQuery.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  payment_status: z.enum(PAYMENT_STATUSES).optional(),
  channel: z.enum(CHANNELS).optional(),
});
