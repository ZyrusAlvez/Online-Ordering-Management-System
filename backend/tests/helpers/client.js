/** Thin HTTP client for the API under test. */

export const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:4100/api/v1';

/**
 * Performs a request and always resolves to { status, body, headers } — a
 * non-2xx is data to assert on, not an exception.
 */
export const request = async (method, path, { body, token, kioskKey, raw, headers = {} } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined && !raw ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(kioskKey ? { 'X-Kiosk-Key': kioskKey } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: raw ? body : JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  return { status: res.status, body: parsed, headers: res.headers };
};

export const get = (path, opts) => request('GET', path, opts);
export const post = (path, body, opts) => request('POST', path, { ...opts, body });
export const patch = (path, body, opts) => request('PATCH', path, { ...opts, body });
export const del = (path, opts) => request('DELETE', path, opts);
