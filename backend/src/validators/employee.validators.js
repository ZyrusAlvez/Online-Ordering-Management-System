import { z } from 'zod';
import { personName } from './fields.js';

export const employeeLoginSchema = z.object({ password: z.string().min(1).max(200) });

export const kioskUnlockSchema = z.object({
  password: z.string().min(1).max(200),
  device_name: personName().default('Kiosk Terminal'),
});

/** What an admin may set. Gate passwords are typed on a touch screen, so keep the floor modest. */
export const employeePasswordSchema = z.object({ password: z.string().min(6).max(200) });

export const employeeRoleParam = z.object({ role: z.enum(['cashier', 'kiosk']) });
