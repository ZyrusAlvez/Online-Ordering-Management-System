'use client';

import { useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// The customer's location, asked for once per page load and shared: the
// landing map, the branch list and checkout all use the same answer, so the
// browser prompt appears at most once.
// ---------------------------------------------------------------------------

/** `undefined` = not asked yet, `null` = denied or unavailable. */
let position;
let asking = null;
const positionListeners = new Set<() => void>();

const settle = (value) => {
  position = value;
  asking = null;
  positionListeners.forEach((fn) => fn());
};

/**
 * Resolves to { latitude, longitude } or rejects with the GeolocationPositionError
 * (code 1 = the customer blocked it). `highAccuracy` is for pinning an address;
 * finding the nearest branch only needs a rough fix, which is faster.
 */
export const getPosition = ({ highAccuracy = false } = {}) =>
  new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(Object.assign(new Error('Location is not available on this device'), { code: 2 }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      reject,
      { enableHighAccuracy: highAccuracy, timeout: 12_000, maximumAge: highAccuracy ? 30_000 : 10 * 60_000 },
    );
  });

const askOnce = () => {
  asking ??= getPosition().then(settle, () => settle(null));
  return asking;
};

/**
 * The customer's rough location for choosing a branch. With `ask`, requests it
 * (once per page load); `position` is null until known, or if they declined.
 */
export function useUserPosition({ ask = true } = {}) {
  const [, rerender] = useState(0);
  useEffect(() => {
    const fn = () => rerender((n) => n + 1);
    positionListeners.add(fn);
    if (ask && position === undefined) askOnce();
    return () => {
      positionListeners.delete(fn);
    };
  }, [ask]);

  return {
    position: position ?? null,
    status: position === undefined ? (asking ? 'asking' : 'idle') : position ? 'granted' : 'denied',
  };
}
