import { z } from 'zod';

export const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const registerSchema = credentialsSchema.extend({
  fullName: z.string().min(1).max(120).optional(),
});

export const refreshSchema = z.object({ refreshToken: z.string().min(1) });
