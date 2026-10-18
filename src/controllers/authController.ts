import type { Session } from '@supabase/supabase-js';
import * as authModel from '@/models/authModel';
import { fail, ok, type Result } from '@/utils/result';

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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const login = async (email: string, password: string): Promise<Result<Session>> => {
  if (!email || !password) return fail('Please fill in all fields');
  const { data, error } = await authModel.signInWithPassword(email.trim(), password);
  if (error || !data.session) return fail('Invalid email or password', 401);
  return ok(data.session);
};

export const register = async (
  email: string,
  password: string,
  fullName?: string,
): Promise<Result<{ session: Session | null }>> => {
  if (!EMAIL.test(email.trim())) return fail('Please enter a valid email address');
  if (password.length < 8 || password.length > 72) return fail('Password must be 8 to 72 characters');
  const name = fullName?.trim();
  if (name && name.length > 120) return fail('Name is too long');

  const { data, error } = await authModel.signUp(email.trim(), password, name || undefined);
  if (error) {
    if (/registered|exists/i.test(error.message)) return fail('That email is already registered', 409);
    return fail(error.message || 'Sign up failed');
  }
  // With email confirmation on there is no session yet; the screen tells them to check their inbox.
  return ok({ session: data.session });
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
