import 'server-only';
import { supabaseAdmin } from '@/utils/supabaseAdmin';

// Attempt counters in public.rate_limits (no browser access). See controllers/server/rateLimit.ts.

export const hit = (key: string, windowSeconds: number) =>
  supabaseAdmin.rpc('rate_limit_hit', { p_key: key, p_window_seconds: windowSeconds });

export const count = (key: string, windowSeconds: number) =>
  supabaseAdmin.rpc('rate_limit_count', { p_key: key, p_window_seconds: windowSeconds });

/** Drops counters whose window ended long ago. */
export const purgeBefore = (iso: string) => supabaseAdmin.from('rate_limits').delete().lt('window_start', iso);
