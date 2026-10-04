// Address lookup through OpenStreetMap's Nominatim. It is free and needs no key, in
// exchange for a fair-use policy: at most one request per second, from a real
// user action. Callers debounce, and each lookup aborts the one before it.
// https://operations.osmfoundation.org/policies/nominatim/

const BASE = 'https://nominatim.openstreetmap.org';

/** Where the map opens when nothing is pinned: General Mariano Alvarez, Cavite (override in .env). */
export const DEFAULT_CENTER = [
  Number(import.meta.env.VITE_MAP_DEFAULT_LAT) || 14.2985,
  Number(import.meta.env.VITE_MAP_DEFAULT_LNG) || 120.997,
];

/** Philippines, so a pin (and the API's own bounds check) can never land anywhere else. */
export const PH_BOUNDS = { south: 4, west: 116, north: 22, east: 128 };
export const inPhilippines = (lat, lng) =>
  lat >= PH_BOUNDS.south && lat <= PH_BOUNDS.north && lng >= PH_BOUNDS.west && lng <= PH_BOUNDS.east;

export const round6 = (n) => Math.round(Number(n) * 1e6) / 1e6;

/** Turns a Nominatim address into the three fields the checkout form has. */
export const toFormAddress = (result) => {
  const a = result?.address ?? {};
  const street = [a.house_number, a.road ?? a.pedestrian ?? a.footway ?? a.path].filter(Boolean).join(' ');
  return {
    line1: street,
    barangay: a.quarter ?? a.neighbourhood ?? a.suburb ?? a.village ?? a.hamlet ?? '',
    city: a.city ?? a.town ?? a.municipality ?? a.county ?? '',
  };
};

const get = async (path, params, signal) => {
  const url = new URL(BASE + path);
  Object.entries({ format: 'jsonv2', addressdetails: 1, 'accept-language': 'en', ...params }).forEach(([k, v]) =>
    url.searchParams.set(k, v),
  );
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Address lookup failed (${res.status})`);
  return res.json();
};

/** The address at a point, or null if the map has nothing there. */
export const reverseGeocode = async (lat, lng, signal) => {
  const result = await get('/reverse', { lat, lon: lng, zoom: 18 }, signal);
  return result?.error ? null : result;
};

/** Up to five Philippine places matching a typed address. */
export const searchPlaces = (text, signal) =>
  get('/search', { q: text, countrycodes: 'ph', limit: 5 }, signal);
