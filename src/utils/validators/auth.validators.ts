import { z } from 'zod';
import { email, password, personName, phone } from './fields';
import { deliveryAddressSchema } from './order.validators';

/** Logging in only needs a password to be present; Supabase decides if it is right. */
export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(72),
});

export const registerSchema = z.object({
  email,
  password,
  fullName: personName().optional(),
});

export const forgotPasswordSchema = z.object({ email });

/** The code Supabase emails to confirm a sign-up or reset a password (Email OTP length: 6). */
export const emailCodeSchema = z.object({
  email,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from the email'),
});

export const resetPasswordSchema = z.object({ password });

/**
 * What a user may change about themselves. Strict on purpose: role and
 * is_active are not here, so sending them is a 400 rather than silently ignored.
 */
export const updateProfileSchema = z
  .object({
    full_name: personName().optional(),
    phone: phone.nullable().optional(),
    default_address: deliveryAddressSchema.nullable().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update' });

export const changePasswordSchema = z.object({
  current_password: z.string().min(1).max(72),
  new_password: password,
});
