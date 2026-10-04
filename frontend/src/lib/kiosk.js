import { request } from './api.js';

// The device key a successful unlock provisions. Stored per browser; the
// employee password is only needed again if it is cleared or revoked.
const KEY = '3k.kioskKey';

export const getKioskKey = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
export const setKioskKey = (key) => {
  try {
    localStorage.setItem(KEY, key);
  } catch {
    // ignore
  }
};
export const clearKioskKey = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
};

/** Kiosk API call. A 401/403 means the key was revoked, so drop it and re-lock. */
export const kioskApi = {
  async call(method, path, body, onLocked) {
    try {
      return await request(path, { method: method.toUpperCase(), body, kioskKey: getKioskKey() });
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        clearKioskKey();
        onLocked?.();
      }
      throw err;
    }
  },
};
