import type { EmailOtpType, Session } from '@supabase/supabase-js';
import * as authModel from '@/models/authModel';
import { fail, ok, type Result } from '@/utils/result';
import { validate } from '@/utils/validate';
import {
  credentialsSchema,
  forgotPasswordSchema,
  registerSchema,
  resetPasswordSchema,
} from '@/utils/validators/auth.validators';

export type Role = 'customer' | 'cashier' | 'rider' | 'admin' | 'super_admin';

/** Where each role lands after signing in. */
export const HOME_FOR_ROLE: Record<Role, string> = {
  customer: '/menu',
  rider: '/driver',
  admin: '/admin',
  super_admin: '/admin',
  cashier: '/cashier',
};

/** An admin manages its own branches; a super admin manages every branch. */
export const ADMIN_ROLES: Role[] = ['admin', 'super_admin'];

/**
 * The role lives in the JWT's app_metadata, which only the server can set. No role means a
 * customer (self-registered or Google). Never read user_metadata: users can edit it.
 */
export const roleOf = (session: Session | null): Role | null =>
  session?.user ? ((session.user.app_metadata?.role as Role | undefined) ?? 'customer') : null;

export const login = async (email: string, password: string): Promise<Result<Session>> => {
  const body = validate(credentialsSchema, { email, password });
  if (body.success === false) return fail('Invalid email or password', 401);
  const { data, error } = await authModel.signInWithPassword(body.data.email, body.data.password);
  // Only said after the right password, so it does not reveal which emails have accounts.
  if (error?.code === 'email_not_confirmed') {
    return fail('Confirm your email first: open the link we sent when you signed up', 403);
  }
  if (error || !data.session) return fail('Invalid email or password', 401);
  return ok(data.session);
};

export const register = async (
  email: string,
  password: string,
  fullName?: string,
): Promise<Result<{ session: Session | null }>> => {
  const body = validate(registerSchema, { email, password, ...(fullName?.trim() ? { fullName } : {}) });
  if (body.success === false) return body;

  const { data, error } = await authModel.signUp(body.data.email, body.data.password, body.data.fullName, confirmUrl());
  if (error) {
    if (/registered|exists/i.test(error.message)) return fail('That email is already registered', 409);
    return fail(error.message || 'Sign up failed');
  }
  // With email confirmation on there is no session yet; the screen tells them to check their inbox.
  return ok({ session: data.session });
};

/** Where the confirm-signup and reset-password emails link to (see supabase/templates/). */
const confirmUrl = () => `${window.location.origin}/auth/confirm`;

const tooManyEmails = (error: { status?: number; code?: string } | null) =>
  error?.status === 429 || /rate_limit/.test(error?.code ?? '');

/**
 * Emails a reset link. Supabase answers the same whether or not the address has an account,
 * and so does this, so the screen cannot be used to find out who is registered.
 */
export const requestPasswordReset = async (email: string): Promise<Result<null>> => {
  const body = validate(forgotPasswordSchema, { email });
  if (body.success === false) return body;
  const { error } = await authModel.resetPasswordForEmail(body.data.email, confirmUrl());
  if (tooManyEmails(error)) return fail('Too many emails sent. Wait a few minutes and try again.', 429);
  if (error) return fail('Could not send the email. Please try again.');
  return ok(null);
};

/** Link types the email templates send; anything else in the URL is refused. */
const EMAIL_LINK_TYPES: EmailOtpType[] = ['email', 'signup', 'recovery'];

const RECOVERY_KEY = '3k.recovery';
// Kept in memory too, for private mode where sessionStorage throws.
let recoveryFor: string | null = null;

let confirming: { tokenHash: string; result: Promise<Result<{ session: Session; recovery: boolean }>> } | null = null;

/**
 * Opens a link from a Supabase email. The link carries a token_hash rather than a PKCE code,
 * so it works in any browser, not only the one that asked for the email. Like the Google code,
 * a token works once, so StrictMode's second run shares the first check.
 */
export const confirmEmailLink = (tokenHash: string | null, type: string | null) => {
  if (confirming?.tokenHash !== tokenHash || !tokenHash) {
    confirming = { tokenHash: tokenHash ?? '', result: verifyLink(tokenHash, type) };
  }
  return confirming.result;
};

const verifyLink = async (
  tokenHash: string | null,
  type: string | null,
): Promise<Result<{ session: Session; recovery: boolean }>> => {
  if (!tokenHash || !EMAIL_LINK_TYPES.includes(type as EmailOtpType)) return fail('This link is incomplete.');
  const { data, error } = await authModel.verifyEmailLink(tokenHash, type as EmailOtpType);
  if (error || !data.session) return fail('This link has expired or was already used.', 401);

  const recovery = type === 'recovery';
  if (recovery) {
    recoveryFor = data.session.user.id;
    try {
      sessionStorage.setItem(RECOVERY_KEY, recoveryFor);
    } catch {
      // Private mode: the in-memory copy lasts until the tab is reloaded.
    }
  }
  return ok({ session: data.session, recovery });
};

/** True when this session came from a reset-password link and has not set a new password yet. */
export const isRecovering = (session: Session | null) => {
  if (!session) return false;
  try {
    recoveryFor ??= sessionStorage.getItem(RECOVERY_KEY);
  } catch {
    // ignore
  }
  return recoveryFor === session.user.id;
};

const endRecovery = () => {
  recoveryFor = null;
  try {
    sessionStorage.removeItem(RECOVERY_KEY);
  } catch {
    // ignore
  }
};

export const setNewPassword = async (password: string): Promise<Result<null>> => {
  const body = validate(resetPasswordSchema, { password });
  if (body.success === false) return body;
  const { error } = await authModel.updatePassword(body.data.password);
  if (error?.code === 'same_password') return fail('Choose a password different from your old one');
  if (error) return fail(error.message || 'Could not change the password', error.status === 401 ? 401 : 400);
  endRecovery();
  // Whoever had the old password is signed out everywhere else.
  await authModel.signOutOthers().catch(() => {});
  return ok(null);
};

const NEXT_KEY = '3k.oauth.next';

/** Only same-site paths: this value comes back out of storage and into the router. */
const safePath = (path: unknown) => (typeof path === 'string' && /^\/(?!\/)/.test(path) ? path : null);

export const loginWithGoogle = async (next?: string | null): Promise<Result<null>> => {
  try {
    const path = safePath(next);
    if (path) sessionStorage.setItem(NEXT_KEY, path);
    else sessionStorage.removeItem(NEXT_KEY);
  } catch {
    // Private mode: they land on their home page afterwards.
  }
  const { error } = await authModel.signInWithGoogle(`${window.location.origin}/auth/callback`);
  if (error) return fail('Google sign-in failed');
  return ok(null);
};

let exchange: Promise<Result<{ session: Session; next: string | null }>> | null = null;

/**
 * Trades the `?code=` Google sent back for a session. A code works once and React StrictMode
 * runs effects twice in development, so the exchange is shared rather than repeated.
 */
export const finishGoogleLogin = (code: string) => {
  exchange ??= (async () => {
    const { data, error } = await authModel.exchangeCodeForSession(code);
    if (error || !data.session) {
      // The PKCE verifier is missing: sign-in started on another address, or this page was reloaded.
      if (/code verifier/i.test(error?.message ?? '')) {
        return fail(
          `Google sent you back to ${window.location.host}, but sign-in was started on a different address ` +
            '(or this page was reloaded). Start again from here.',
        );
      }
      return fail(error?.message ?? 'Google sign-in did not complete. Please try again.');
    }
    let next: string | null = null;
    try {
      next = safePath(sessionStorage.getItem(NEXT_KEY));
      sessionStorage.removeItem(NEXT_KEY);
    } catch {
      // ignore
    }
    return ok({ session: data.session, next });
  })();
  return exchange;
};

/** Adopts a session the server signed in (the branch cashier gate). */
export const adoptSession = async (session: { access_token: string; refresh_token: string }) => {
  const { error } = await authModel.setSession(session.access_token, session.refresh_token);
  return error ? fail('Could not start the session', 500) : ok(null);
};

export const logout = async () => {
  endRecovery();
  // Signing out locally must always succeed, even offline.
  await authModel.signOut().catch(() => {});
};

export const getSession = async () => (await authModel.getSession()).data.session;

export const onAuthStateChange = authModel.onAuthStateChange;

/** A deactivated account may still hold a valid token until it expires. */
export const isActive = async (userId: string) => {
  const { data } = await authModel.getActiveFlag(userId);
  return data?.is_active !== false;
};
