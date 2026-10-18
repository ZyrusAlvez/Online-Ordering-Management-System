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

/**
 * Runs a kiosk server action with this device's key. A 401/403 means the key was revoked,
 * so drop it and re-lock the screen.
 */
export async function kioskCall<T>(
  action: (key: string | null) => Promise<import('@/utils/result').Result<T>>,
  onLocked?: () => void,
): Promise<T> {
  const { call } = await import('@/utils/apiError');
  try {
    return await call(action(getKioskKey()));
  } catch (err: any) {
    if (err.status === 401 || err.status === 403) {
      clearKioskKey();
      onLocked?.();
    }
    throw err;
  }
}
