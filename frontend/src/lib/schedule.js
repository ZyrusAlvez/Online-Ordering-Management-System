import { addDays, manilaToday } from './format.js';
import { clock12, isOpenAllDay, isOpenNow, toMinutes } from './geo.js';

// The same rules the API enforces (backend/src/utils/schedule.js): a 15-minute
// slot, at least 30 minutes away, today or the next two Manila days, inside the
// branch's hours. Offering only valid slots means the API should never refuse one.
export const SLOT_MINUTES = 15;
export const LEAD_MINUTES = 30;
export const DAYS_AHEAD = 2;

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** The instant of a Manila wall-clock time on a Manila day, as ISO (UTC). */
export const manilaInstant = (day, minutes) => new Date(`${day}T${hhmm(minutes)}:00+08:00`).toISOString();

export const scheduleDays = () => Array.from({ length: DAYS_AHEAD + 1 }, (_, n) => addDays(manilaToday(), n));

/** Every slot the branch offers on a Manila day: [{ value: iso, label: '3:15 PM' }]. */
export const slotsFor = (branch, day, now = Date.now()) => {
  const start = isOpenAllDay(branch) ? 0 : toMinutes(branch.opens_at);
  const end = isOpenAllDay(branch) ? 24 * 60 : toMinutes(branch.closes_at);
  const earliest = now + LEAD_MINUTES * 60_000;
  const slots = [];
  for (let m = Math.ceil(start / SLOT_MINUTES) * SLOT_MINUTES; m < end; m += SLOT_MINUTES) {
    const value = manilaInstant(day, m);
    if (Date.parse(value) >= earliest) slots.push({ value, label: clock12(hhmm(m)) });
  }
  return slots;
};

/** ASAP is only possible while the branch is open. */
export const canOrderNow = (branch) => isOpenNow(branch);
