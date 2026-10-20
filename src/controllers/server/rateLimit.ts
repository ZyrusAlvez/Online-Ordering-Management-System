import 'server-only';
import { headers } from 'next/headers';
import * as rateLimitModel from '@/models/server/rateLimitModel';
import { RESEND_SECONDS } from '@/constants/auth';
import { fail, ok, type Result } from '@/utils/result';

// The limits the Express server had (express-rate-limit), kept in the database so they hold on
// serverless hosts where each request may run on a fresh instance.

export type Rule = { name: string; max: number; windowSeconds: number; message: string };

const TOO_MANY = 'Too many attempts. Try again later.';

export const RULES = {
  // Shared passwords anyone can guess at: only wrong guesses count, so several registers behind
  // one shop router never lock each other out by logging in correctly.
  cashierGate: { name: 'cashier-gate', max: 10, windowSeconds: 15 * 60, message: TOO_MANY },
  kioskGate: { name: 'kiosk-gate', max: 10, windowSeconds: 15 * 60, message: TOO_MANY },
  // The current password is re-checked on every attempt, so a stolen session could guess it.
  passwordChange: { name: 'password-change', max: 10, windowSeconds: 15 * 60, message: TOO_MANY },
  // Forgot password says whether an email has an account, so checking addresses is limited per
  // visitor; and one code per address every RESEND_SECONDS, matching the Resend countdown.
  passwordResetLookup: { name: 'password-reset-lookup', max: 10, windowSeconds: 15 * 60, message: TOO_MANY },
  passwordResetEmail: {
    name: 'password-reset-email',
    max: 1,
    windowSeconds: RESEND_SECONDS,
    message: `Wait ${RESEND_SECONDS} seconds before asking for another code.`,
  },
  // A kiosk is a public terminal.
  kioskOrder: { name: 'kiosk-order', max: 30, windowSeconds: 60, message: 'Too many orders from this kiosk. Wait a minute.' },
  // Guest chat needs no account. Opening threads is the expensive abuse (each is a row the
  // cashier sees); photos are heavy (up to 5 MB each, stored).
  visitorThread: { name: 'visitor-thread', max: 5, windowSeconds: 60 * 60, message: 'Too many conversations started. Try again later.' },
  visitorMessage: { name: 'visitor-message', max: 20, windowSeconds: 60, message: 'You are sending messages too fast.' },
  visitorImage: { name: 'visitor-image', max: 10, windowSeconds: 10 * 60, message: 'You are sending photos too fast. Try again in a few minutes.' },
} satisfies Record<string, Rule>;

/**
 * The visitor's IP address. Vercel sets x-forwarded-for itself (a client cannot spoof it there);
 * behind another host, make sure its proxy does the same. Null outside a web request (scripts),
 * where IP limits do not apply.
 */
export const clientIp = async (): Promise<string | null> => {
  try {
    const h = await headers();
    return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
  } catch {
    return null;
  }
};

const refuse = (rule: Rule) => fail(rule.message, 429);

// Now and then, clear counters a day past their window so the table stays small.
const maybePurge = () => {
  if (Math.random() < 0.02) rateLimitModel.purgeBefore(new Date(Date.now() - 86_400_000).toISOString()).then(() => {}, () => {});
};

/**
 * Counts this attempt for `who` and refuses it once more than `rule.max` happened in the window.
 * A database error lets the attempt through: a counter problem must not take the shop down.
 */
export const limit = async (rule: Rule, who: string | null): Promise<Result<null>> => {
  if (!who) return ok(null);
  maybePurge();
  const { data, error } = await rateLimitModel.hit(`${rule.name}:${who}`, rule.windowSeconds);
  if (error) {
    console.error('rate limit', rule.name, error.message);
    return ok(null);
  }
  return (data as number) > rule.max ? refuse(rule) : ok(null);
};

/** For limits that count failures only: refuses when `who` already used up the allowance. */
export const checkFailures = async (rule: Rule, who: string | null): Promise<Result<null>> => {
  if (!who) return ok(null);
  const { data, error } = await rateLimitModel.count(`${rule.name}:${who}`, rule.windowSeconds);
  if (error) {
    console.error('rate limit', rule.name, error.message);
    return ok(null);
  }
  return (data as number) >= rule.max ? refuse(rule) : ok(null);
};

/** Records a failed attempt for a checkFailures limit. */
export const recordFailure = async (rule: Rule, who: string | null) => {
  if (!who) return;
  maybePurge();
  await rateLimitModel.hit(`${rule.name}:${who}`, rule.windowSeconds).then(() => {}, () => {});
};
