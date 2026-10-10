import { ApiError } from './ApiError.js';
import { addDays, manilaToday } from './manilaDate.js';

/**
 * When an online order may be for. Pure, so the rules are unit-tested without a
 * database or a fixed clock: pass `now`.
 *
 *   ASAP       only while the branch is open
 *   scheduled  a 15-minute slot, at least 30 minutes away, today or the next two
 *              Manila days, starting inside the branch's opening hours
 *
 * Branch hours are Manila wall-clock "HH:MM" strings; null hours mean the branch
 * is open around the clock.
 */
export const SLOT_MINUTES = 15;
export const LEAD_MINUTES = 30;
export const DAYS_AHEAD = 2; // today plus two more days

const MANILA_OFFSET_MS = 8 * 3600_000; // UTC+8 all year

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
};

/** Minutes since midnight, Manila time, for an instant. */
export const manilaMinutes = (date) => {
  const local = new Date(date.getTime() + MANILA_OFFSET_MS);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
};

const alwaysOpen = (branch) => !branch.opens_at || !branch.closes_at;

export const isOpenAt = (branch, date) => {
  if (alwaysOpen(branch)) return true;
  const minutes = manilaMinutes(date);
  return minutes >= toMinutes(branch.opens_at) && minutes < toMinutes(branch.closes_at);
};

const fail = (message) => ApiError.badRequest(message, { scheduled_for: [message] });

/**
 * Throws unless an order at `branch` may be placed for `scheduledFor` (an ISO
 * string, or null for as soon as possible).
 */
export const assertOrderTime = (branch, scheduledFor, now = new Date()) => {
  if (!scheduledFor) {
    if (!isOpenAt(branch, now)) {
      throw ApiError.conflict(`${branch.name} is closed now. Schedule your order for later.`, {
        scheduled_for: ['Required while the branch is closed'],
      });
    }
    return;
  }

  const slot = new Date(scheduledFor);
  if (Number.isNaN(slot.getTime())) throw fail('Not a valid time');
  // Manila is a whole number of hours from UTC, so a 15-minute boundary is the same in both.
  if (slot.getUTCSeconds() || slot.getUTCMilliseconds() || slot.getUTCMinutes() % SLOT_MINUTES) {
    throw fail(`Choose a time on a ${SLOT_MINUTES}-minute mark, e.g. 3:15 PM`);
  }
  if (slot.getTime() < now.getTime() + LEAD_MINUTES * 60_000) {
    throw fail(`Schedule at least ${LEAD_MINUTES} minutes ahead`);
  }
  if (manilaToday(slot) > addDays(manilaToday(now), DAYS_AHEAD)) {
    throw fail(`Orders can be scheduled up to ${DAYS_AHEAD} days ahead`);
  }
  if (!isOpenAt(branch, slot)) {
    throw fail(`${branch.name} is closed at that time`);
  }
};

/** The first slot an order could be scheduled for at `branch` (ISO string), or null if none in range. */
export const nextOpenSlot = (branch, now = new Date()) => {
  const step = SLOT_MINUTES * 60_000;
  let t = Math.ceil((now.getTime() + LEAD_MINUTES * 60_000) / step) * step;
  const last = addDays(manilaToday(now), DAYS_AHEAD);
  for (; manilaToday(new Date(t)) <= last; t += step) {
    if (isOpenAt(branch, new Date(t))) return new Date(t).toISOString();
  }
  return null;
};
