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
