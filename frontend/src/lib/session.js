// Single source of truth for the signed-in session. Lives outside React so the
// API client can read and refresh it, and React can subscribe to changes.
const KEY = '3k.session';
const listeners = new Set();

let current = null;
try {
  current = JSON.parse(localStorage.getItem(KEY));
} catch {
  current = null;
}

export const getSession = () => current;

/** Re-reads localStorage. Another tab may have refreshed (and rotated) the tokens. */
export const syncFromStorage = () => {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(KEY));
  } catch {
    stored = null;
  }
  const changed = JSON.stringify(stored?.session?.access_token) !== JSON.stringify(current?.session?.access_token)
    || Boolean(stored) !== Boolean(current);
  if (changed) {
    current = stored;
    listeners.forEach((fn) => fn(current));
  }
  return changed;
};

// Tokens rotate on every refresh, so a tab holding an old refresh token would
// get the whole session revoked on its next use. Pick up the other tab's session
// (and its sign-out) the moment it is written.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY || e.key === null) syncFromStorage();
  });
}

export const saveSession = (session) => {
  current = session;
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Private mode: the session still works for this tab.
  }
  listeners.forEach((fn) => fn(current));
};

export const clearSession = () => {
  current = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  listeners.forEach((fn) => fn(null));
};

export const onSessionChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/**
 * Role lives in the JWT's app_metadata; cashiers/riders/admins are set
 * server-side. An account with no role (self-registered, or signed in with
 * Google) is a customer. Never read user_metadata: users can edit it.
 */
export const roleOf = (session) =>
  session?.user ? (session.user.app_metadata?.role ?? 'customer') : null;
