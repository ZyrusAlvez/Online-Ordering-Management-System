import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Secret-key client. `server-only` makes the build fail if a client component imports this,
// so the key can never end up in the browser bundle (unlike EXPO_PUBLIC_SERVICE_ROLE_KEY in Pasuyo).
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SECRET_KEY || '',
  { auth: { autoRefreshToken: false, persistSession: false } },
);
