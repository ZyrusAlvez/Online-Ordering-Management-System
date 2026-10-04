import { z } from 'zod';
import { ROLES } from '../constants/orders.js';
import { paginationQuery } from './common.validators.js';
import { email, password, personName, phone } from './fields.js';
import { orderFilterQuery } from './order.validators.js';

export const adminOrderQuery = orderFilterQuery.extend({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const riderListQuery = paginationQuery;

export const createRiderSchema = z.object({
  email,
  password,
  full_name: personName(),
  phone: phone.optional(),
});

export const updateRiderSchema = z
  .object({
    is_active: z.boolean().optional(),
    full_name: personName().optional(),
    // null clears the number
    phone: phone.nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update' });

export const createKioskSchema = z.object({ name: personName() });

export const siteImageKeyParam = z.object({ key: z.enum(['logo', 'promo']) });

export const roleSchema = z.object({ role: z.enum(ROLES) });
