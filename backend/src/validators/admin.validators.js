import { z } from 'zod';
import { ROLES } from '../constants/orders.js';
import { paginationQuery } from './common.validators.js';
import { orderFilterQuery } from './order.validators.js';

export const adminOrderQuery = orderFilterQuery.extend({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const riderListQuery = paginationQuery;

export const createRiderSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1).max(120),
  phone: z.string().min(7).max(20).optional(),
});

export const updateRiderSchema = z
  .object({
    is_active: z.boolean().optional(),
    full_name: z.string().min(1).max(120).optional(),
    phone: z.string().min(7).max(20).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update' });

export const createKioskSchema = z.object({ name: z.string().min(1).max(120) });

export const roleSchema = z.object({ role: z.enum(ROLES) });
