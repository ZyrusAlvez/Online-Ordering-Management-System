import { addDays, manilaToday } from '@/utils/format';
import { clock12, isOpenAllDay, isOpenNow, toMinutes } from '@/utils/geo';

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

// ---------------------------------------------------------------------------
// The rules an order's time must pass (port of backend/src/utils/schedule.js).
// Pure, so they are testable with a fixed `now`.
//   ASAP       only while the branch is open
//   scheduled  a 15-minute slot, at least 30 minutes away, today or the next two
//              Manila days, starting inside the branch's opening hours
// ---------------------------------------------------------------------------

const MANILA_OFFSET_MS = 8 * 3600_000; // UTC+8 all year

const manilaMinutes = (date: Date) => {
  const local = new Date(date.getTime() + MANILA_OFFSET_MS);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
};

const manilaDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date);

const plusDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

type Hours = { name: string; opens_at: string | null; closes_at: string | null };

const hhmmToMinutes = (hhmm: string) => {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
};

export const isOpenAt = (branch: Hours, date: Date) => {
  if (!branch.opens_at || !branch.closes_at) return true;
  const minutes = manilaMinutes(date);
  return minutes >= hhmmToMinutes(branch.opens_at) && minutes < hhmmToMinutes(branch.closes_at);
};

/** Null when an order at `branch` may be placed for `scheduledFor` (ISO, or null for ASAP); otherwise why not. */
export const orderTimeProblem = (
  branch: Hours,
  scheduledFor: string | null,
  now = new Date(),
): { message: string; status: number } | null => {
  if (!scheduledFor) {
    return isOpenAt(branch, now)
      ? null
      : { message: `${branch.name} is closed now. Schedule your order for later.`, status: 409 };
  }
  const slot = new Date(scheduledFor);
  if (Number.isNaN(slot.getTime())) return { message: 'Not a valid time', status: 400 };
  // Manila is a whole number of hours from UTC, so a 15-minute boundary is the same in both.
  if (slot.getUTCSeconds() || slot.getUTCMilliseconds() || slot.getUTCMinutes() % SLOT_MINUTES) {
    return { message: `Choose a time on a ${SLOT_MINUTES}-minute mark, e.g. 3:15 PM`, status: 400 };
  }
  if (slot.getTime() < now.getTime() + LEAD_MINUTES * 60_000) {
    return { message: `Schedule at least ${LEAD_MINUTES} minutes ahead`, status: 400 };
  }
  if (manilaDay(slot) > plusDays(manilaDay(now), DAYS_AHEAD)) {
    return { message: `Orders can be scheduled up to ${DAYS_AHEAD} days ahead`, status: 400 };
  }
  if (!isOpenAt(branch, slot)) return { message: `${branch.name} is closed at that time`, status: 400 };
  return null;
};
