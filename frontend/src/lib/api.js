import { clearSession, getSession, onSessionChange, saveSession, syncFromStorage } from './session.js';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }

  /** First field-level validation message, if any — nicer than "Invalid request body". */
  get friendly() {
    const fields = this.details && Object.values(this.details).flat().filter(Boolean);
    return fields?.[0] ?? this.message;
  }
}

const buildUrl = (path, query) => {
  const url = new URL(API_URL + path);
  Object.entries(query ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  return url;
};

let refreshing = null;

/** The server said this refresh token is dead (as opposed to a network blip or an outage). */
class SessionExpired extends Error {}

/**
 * One refresh at a time, so a burst of 401s does not burn the refresh token.
 * Pass the access token the failed request used: if another tab has already
 * refreshed since, its new token is used instead of refreshing a second time.
 */
export const refreshSession = (staleAccessToken) => {
  refreshing ??= (async () => {
    syncFromStorage();
    const session = getSession();
    if (!session?.session?.refresh_token) throw new SessionExpired('no refresh token');
    if (staleAccessToken && session.session.access_token !== staleAccessToken) return;

    let res;
    try {
      res = await fetch(API_URL + '/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.session.refresh_token }),
      });
    } catch {
      throw new Error('offline'); // keep the session; try again next time
    }

    // Only a rejected token ends the session. A 429 or a 5xx is the server having
    // a bad moment, and signing everyone out for that would be the wrong answer.
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new SessionExpired('refresh token rejected');
    }
    if (!res.ok) throw new Error(`refresh failed (${res.status})`);
    saveSession(await res.json());
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
};

/**
 * Keeps the access token fresh in the background: refreshes a couple of minutes
 * before it expires, and again whenever the tab wakes up or the network returns.
 * Pages that only listen to realtime (the driver screen) never make a request
 * that would trigger a refresh, so without this their socket goes quiet when the
 * token expires. Returns a function that stops it.
 */
export const keepSessionFresh = () => {
  let timer = null;

  const schedule = () => {
    clearTimeout(timer);
    const expiresAt = getSession()?.session?.expires_at;
    if (!expiresAt) return;
    const wait = Math.max(5_000, expiresAt * 1000 - Date.now() - 120_000);
    timer = setTimeout(refreshIfNeeded, Math.min(wait, 2_147_000_000));
  };

  async function refreshIfNeeded() {
    syncFromStorage();
    const session = getSession()?.session;
    if (!session?.refresh_token) return;
    const secondsLeft = (session.expires_at ?? 0) - Date.now() / 1000;
    if (secondsLeft < 180) {
      try {
        await refreshSession();
      } catch (err) {
        if (err instanceof SessionExpired) clearSession();
      }
    }
    schedule();
  }

  const wake = () => document.visibilityState !== 'hidden' && refreshIfNeeded();
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('online', wake);
  const off = onSessionChange(schedule);
  refreshIfNeeded();

  return () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', wake);
    window.removeEventListener('online', wake);
    off();
  };
};

/**
 * Calls the backend. Returns the parsed JSON body: `{ data, meta }` for the
 * resource routes, `{ user, session }` for auth, or null for 204.
 *
 *   auth: true      -> Bearer token, refreshed once on 401
 *   kioskKey: '…'   -> X-Kiosk-Key header (kiosk app)
 *   headers: {…}    -> extra request headers (e.g. X-Chat-Token)
 */
export const request = async (
  path,
  { method = 'GET', body, query, auth = false, kioskKey, headers: extraHeaders, retry = true } = {},
) => {
  const headers = { ...extraHeaders };
  // A Blob (an image upload) is sent as-is; everything else is JSON.
  const isBlob = body instanceof Blob;
  if (body !== undefined) headers['Content-Type'] = isBlob ? body.type : 'application/json';
  if (auth) {
    const token = getSession()?.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (kioskKey) headers['X-Kiosk-Key'] = kioskKey;

  let res;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body !== undefined ? (isBlob ? body : JSON.stringify(body)) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }

  if (res.status === 401 && auth && retry) {
    const used = headers.Authorization?.replace('Bearer ', '');
    try {
      await refreshSession(used);
    } catch (err) {
      // Sign out only when the server says the session is really over.
      if (err instanceof SessionExpired) clearSession();
      throw new ApiError(401, 'Your session has ended. Please log in again.');
    }
    return request(path, { method, body, query, auth, kioskKey, headers: extraHeaders, retry: false });
  }

  if (res.status === 204) return null;

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      json?.error?.message ?? `Request failed (${res.status})`,
      json?.error?.details,
    );
  }
  return json;
};

// Convenience wrappers. `data` unwrapping happens at the call site via `.data`.
export const api = {
  get: (path, opts) => request(path, opts),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
  del: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
};
