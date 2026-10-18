/**
 * Calendar days in the restaurant's timezone.
 *
 * Reports are by Manila day (Asia/Manila is UTC+8 all year, no daylight saving),
 * so "today" means the restaurant's today whatever the server's or the browser's
 * clock says. Days are plain `YYYY-MM-DD` strings.
 */

const MANILA_OFFSET = '+08:00';
const DAY_MS = 86_400_000;

/** Today's date in Manila. */
export const manilaToday = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now);

/** True for a real calendar date such as 2026-02-28, false for 2026-02-30 or junk. */
export const isRealDate = (day) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const parsed = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
};

export const addDays = (day, n) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Whole days from `from` to `to`, inclusive of both ends. */
export const daysInRange = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;

/** The instants [start of `from`, start of the day after `to`) in Manila, as ISO strings with offset. */
export const manilaBounds = (from, to) => ({
  start: `${from}T00:00:00${MANILA_OFFSET}`,
  end: `${addDays(to, 1)}T00:00:00${MANILA_OFFSET}`,
});
