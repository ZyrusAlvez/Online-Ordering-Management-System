import type { ZodType, ZodTypeDef } from 'zod';
import { fail, ok, type Result } from '@/utils/result';

/** Runs a zod schema; on failure returns the first field's message, as the old API did. */
export const validate = <T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown): Result<T> => {
  const parsed = schema.safeParse(input);
  if (parsed.success) return ok(parsed.data);
  const issue = parsed.error.issues[0];
  return fail(issue?.message ?? 'Invalid input', 400);
};
