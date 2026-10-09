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
