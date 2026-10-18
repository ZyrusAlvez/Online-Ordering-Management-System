import type { PostgrestError } from '@supabase/supabase-js';

// What every controller returns (same shape as Pasuyo's controllers).
// `status` keeps the HTTP-style codes the old API used, so screens can still tell
// a conflict (409, "someone else got there first") from a plain failure.
export type Result<T> =
  | { success: true; data: T; error?: undefined }
  | { success: false; error: string; status?: number; data?: undefined };

export const ok = <T>(data: T): Result<T> => ({ success: true, data });

export const fail = (error: string, status = 400): { success: false; error: string; status: number } => ({
  success: false,
  error,
  status,
});

/** Turns a Supabase error into a failed Result with a readable message. */
export const fromDbError = (error: PostgrestError | { message: string; code?: string }, fallback = 'Something went wrong') => {
  const code = 'code' in error ? error.code : undefined;
  if (code === '23505') return fail('That already exists', 409);
  if (code === '23503') return fail('It is still in use, so it cannot be changed', 409);
  if (code === '23514' || code === '22P02') return fail('Some of the values are not valid', 400);
  if (code === '42501') return fail('You are not allowed to do that', 403);
  return fail(error.message || fallback, 500);
};
