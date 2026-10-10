import { useEffect, useState } from 'react';

// Branch hours. Branches keep Manila wall-clock hours ("08:00"–"21:00", or none
// for open around the clock); the checks here use Manila time whatever the
// browser's own timezone is.

/** "08:00" -> 480 */
export const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Minutes since midnight in Manila right now. */
export const manilaMinutesNow = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return get('hour') * 60 + get('minute');
};

/** "08:00" -> "8:00 AM" */
export const clock12 = (hhmm) => {
  const minutes = toMinutes(hhmm);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

export const isOpenAllDay = (branch) => !branch.opens_at || !branch.closes_at;

export const isOpenNow = (branch, now = new Date()) => {
  if (isOpenAllDay(branch)) return true;
  const minutes = manilaMinutesNow(now);
  return minutes >= toMinutes(branch.opens_at) && minutes < toMinutes(branch.closes_at);
};

/** "8:00 AM – 9:00 PM" or "Open 24 hours" */
export const hoursLabel = (branch) =>
  isOpenAllDay(branch) ? 'Open 24 hours' : `${clock12(branch.opens_at)} – ${clock12(branch.closes_at)}`;

// ---------------------------------------------------------------------------
// The customer's location, asked for once per page load and shared: the
// landing map, the branch list and checkout all use the same answer, so the
// browser prompt appears at most once.
// ---------------------------------------------------------------------------

/** `undefined` = not asked yet, `null` = denied or unavailable. */
let position;
let asking = null;
const positionListeners = new Set();

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
  new Promise((resolve, reject) => {
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
    return () => positionListeners.delete(fn);
  }, [ask]);

  return {
    position: position ?? null,
    status: position === undefined ? (asking ? 'asking' : 'idle') : position ? 'granted' : 'denied',
  };
}

/** Great-circle distance in km between two { latitude, longitude } points. */
export const haversineKm = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

/** Branches with `distanceKm` from `from` (null when unknown), nearest first when known. */
export const byDistance = (branches, from) => {
  const withKm = branches.map((b) => ({ ...b, distanceKm: from ? haversineKm(from, b) : null }));
  return from ? withKm.sort((a, b) => a.distanceKm - b.distanceKm) : withKm;
};

export const nearestBranch = (branches, from) => (from && branches.length ? byDistance(branches, from)[0] : null);

/** "850 m" / "4.2 km" */
export const formatKm = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`);

/** Turn-by-turn directions to a branch in the phone's maps app (or Google Maps on a computer). */
export const directionsUrl = (branch) =>
  `https://www.google.com/maps/dir/?api=1&destination=${branch.latitude},${branch.longitude}`;
