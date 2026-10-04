import { z } from 'zod';
import {
  CHANNELS,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  REMOTE_FULFILLMENT,
} from '../constants/orders.js';
import { itemsSchema, paginationQuery } from './common.validators.js';
import { latitude, longitude, optionalText, phone, requiredText } from './fields.js';

export const deliveryAddressSchema = z
  .object({
    line1: requiredText(300, 'Street address is required'),
    barangay: optionalText(120).optional(),
    city: requiredText(120, 'City is required'),
    landmark: optionalText(300).optional(),
    notes: optionalText(500).optional(),
    // Where the customer dropped the pin on the map (optional, but both or neither).
    latitude: latitude.optional(),
    longitude: longitude.optional(),
  })
  .refine((a) => (a.latitude === undefined) === (a.longitude === undefined), {
    message: 'latitude and longitude must be sent together',
    path: ['latitude'],
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
    customer_phone: phone.optional(),
    items: itemsSchema,
    notes: optionalText(1000).optional(),
  })
  .refine((body) => body.fulfillment_type !== 'delivery' || body.delivery_address, {
    message: 'delivery_address is required when fulfillment_type is "delivery"',
    path: ['delivery_address'],
  })
  // The rider phones the customer, so a delivery without a number is not usable.
  .refine((body) => body.fulfillment_type !== 'delivery' || body.customer_phone, {
    message: 'A mobile number is required for delivery',
    path: ['customer_phone'],
  });

export const statusBody = z.object({ status: z.enum(ORDER_STATUSES) });

/** Filters shared by the POS queue and the admin order list. */
export const orderFilterQuery = paginationQuery.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  payment_status: z.enum(PAYMENT_STATUSES).optional(),
  channel: z.enum(CHANNELS).optional(),
});
