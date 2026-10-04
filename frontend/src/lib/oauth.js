import { createClient } from '@supabase/supabase-js';
import { saveSession } from './session.js';

// Used only to get through "Sign in with Google". The app's own session (and
// its refresh) stays with the API; this client just carries the PKCE exchange
// across the redirect to Google and back, so it needs real storage, unlike the
// realtime client in supabase.js.
const oauth = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      storageKey: '3k.oauth',
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);

const NEXT_KEY = '3k.oauth.next';

/** Only same-site paths: this value comes back out of storage and into navigate(). */
const safePath = (path) => (typeof path === 'string' && /^\/(?!\/)/.test(path) ? path : null);

/** Remembers where to go afterwards, then sends the browser to Google. */
export async function startGoogleSignIn(next) {
  try {
    const path = safePath(next);
    if (path) sessionStorage.setItem(NEXT_KEY, path);
    else sessionStorage.removeItem(NEXT_KEY);
  } catch {
    // Private mode: the user just lands on their home page afterwards.
  }

  const { error } = await oauth.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw error;
}

/** Removes everything the OAuth client wrote (its session and the PKCE code verifier). */
const forgetOAuthClientState = () => {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith('3k.oauth'))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore
  }
};

let exchange = null;

/**
 * Trades the `?code=` Google/Supabase sent back for a session and hands it to
 * the app. A code works once and React StrictMode mounts effects twice in
 * development, so the exchange is shared rather than repeated.
 */
export function finishGoogleSignIn(code) {
  exchange ??= (async () => {
    const { data, error } = await oauth.auth.exchangeCodeForSession(code);
    if (error) throw error;

    // The app refreshes through the API, so this client's own copy is not needed.
    // Delete it from storage directly. Do NOT call oauth.auth.signOut(): even with
    // scope 'local' it asks the server to end the session, which is the very
    // session about to be handed to the app, so the first real request after
    // signing in would be rejected and the user bounced back to the login page.
    forgetOAuthClientState();

    // Google's own access/refresh tokens are not needed after sign-in; do not keep them.
    const { provider_token: _a, provider_refresh_token: _b, ...appSession } = data.session;
    const session = { user: appSession.user, session: appSession };
    saveSession(session);

    let next = null;
    try {
      next = safePath(sessionStorage.getItem(NEXT_KEY));
      sessionStorage.removeItem(NEXT_KEY);
    } catch {
      // ignore
    }
    return { session, next };
  })();
  return exchange;
}
