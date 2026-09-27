import { env } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';

/** Liveness — does not touch Supabase. */
export const liveness = (_req, res) => {
  res.json({
    status: 'ok',
    env: env.NODE_ENV,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
};

/** Readiness — confirms the Supabase credentials actually work. */
export const readiness = async (_req, res) => {
  const { error } = await supabaseAdmin.auth.getUser('probe');
  // A 4xx from Supabase still proves the project URL and key are reachable;
  // only a transport failure means we cannot talk to it.
  const reachable = !error || typeof error.status === 'number';

  res.status(reachable ? 200 : 503).json({
    status: reachable ? 'ok' : 'unreachable',
    supabaseUrl: env.SUPABASE_URL,
    ...(reachable ? {} : { message: error?.message }),
  });
};
