import { z } from 'zod';
import { ROLES } from '../constants/orders.js';
import { branchId, paginationQuery } from './common.validators.js';
import { email, password, personName, phone } from './fields.js';
import { addDays, daysInRange, isRealDate, manilaToday } from '../utils/manilaDate.js';
import { orderFilterQuery } from './order.validators.js';

export const adminOrderQuery = orderFilterQuery.extend({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const riderListQuery = paginationQuery.extend({ branch_id: branchId.optional() });

export const createRiderSchema = z.object({
  // A rider delivers for one branch and only sees that branch's pool.
  branch_id: branchId,
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
    // Move the rider to another branch (both must be the admin's).
    branch_id: branchId.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update' });

export const createKioskSchema = z.object({ name: personName(), branch_id: branchId });

export const kioskListQuery = z.object({ branch_id: branchId.optional() });

// --- admin accounts (super admin only) ---
const branchIds = z.array(branchId).min(1, 'Choose at least one branch').max(50);

export const adminListQuery = paginationQuery;

export const createAdminSchema = z.object({
  email,
  password,
  full_name: personName(),
  phone: phone.optional(),
  branch_ids: branchIds,
});

export const updateAdminSchema = z
  .object({
    is_active: z.boolean().optional(),
    full_name: personName().optional(),
    branch_ids: branchIds.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update' });

export const siteImageKeyParam = z.object({ key: z.enum(['logo', 'promo']) });

export const roleSchema = z.object({ role: z.enum(ROLES) });

export const MAX_REPORT_DAYS = 366;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine(isRealDate, 'Not a real date');

/**
 * Sales report range, in Manila calendar days (both ends included). With nothing
 * given it is the last 7 days ending today; with only `from`, it runs through today.
 */
export const salesQuery = z
  .object({ from: day.optional(), to: day.optional(), branch_id: branchId.optional() })
  .transform(({ from, to, branch_id: branch }) => {
    const end = to ?? manilaToday();
    return { from: from ?? addDays(end, -6), to: end, branch_id: branch };
  })
  .refine((q) => q.to >= q.from, { message: '"to" must not be before "from"', path: ['to'] })
  .refine((q) => daysInRange(q.from, q.to) <= MAX_REPORT_DAYS, {
    message: `Choose at most ${MAX_REPORT_DAYS} days`,
    path: ['to'],
  });
