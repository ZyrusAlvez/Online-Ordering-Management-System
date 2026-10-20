import { fail } from '@/utils/result';

/**
 * Supabase's own email limits: one email per address per "minimum interval" (SMTP settings) and
 * a few an hour in all. Null when the error is something else.
 */
export const emailRefused = (error: { status?: number; message?: string } | null) => {
  if (error?.status !== 429) return null;
  const seconds = /after (\d+) seconds/.exec(error.message ?? '')?.[1];
  return fail(
    seconds ? `Wait ${seconds} seconds before asking for another code.` : 'Too many emails sent. Try again later.',
    429,
  );
};
