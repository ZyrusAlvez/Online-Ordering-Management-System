import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

const baseOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
};

/**
 * Secret-key client. Bypasses Row Level Security — use it only for trusted
 * server-side work (admin dashboards, background jobs, webhooks).
 * (Replaces the legacy "service_role" client.)
 */
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  baseOptions,
);

/**
 * Publishable-key client. Subject to Row Level Security with no user
 * attached. Good for public reads (e.g. a published menu) and for auth
 * calls. (Replaces the legacy "anon" client.)
 */
export const supabaseAnon = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_PUBLISHABLE_KEY,
  baseOptions,
);

/**
 * A throwaway publishable-key client for ONE sign-in/refresh/verify call.
 *
 * Signing in stores the session on the client that did it, even with
 * persistSession off (it lives in memory). On the shared `supabaseAnon` that
 * would leave the last person to log in attached to every later "anonymous"
 * read, which then runs with their JWT instead of none. Anything that signs a
 * user in goes through this instead.
 */
export const createAnonClient = () =>
  createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, baseOptions);

/**
 * Client that acts as the caller, so Row Level Security policies apply to the
 * user behind `accessToken`. Prefer this for anything request-scoped.
 */
export const supabaseForToken = (accessToken) =>
  createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    ...baseOptions,
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
