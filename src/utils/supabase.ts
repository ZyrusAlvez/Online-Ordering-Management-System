import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

// The one browser client: auth session, reads, writes (subject to RLS), storage and realtime.
// The session is kept in localStorage and refreshed automatically.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    // The /auth/callback screen exchanges Google's code itself, so it can explain failures.
    detectSessionInUrl: false,
    flowType: 'pkce',
    storageKey: '3k.auth',
  },
});
