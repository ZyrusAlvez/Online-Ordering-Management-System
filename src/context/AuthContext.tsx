'use client';

import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authController from '@/controllers/authController';
import { loginCashier as loginCashierAction } from '@/controllers/server/employeeActions';
import { LOGOUT_EVENT } from '@/context/CartContext';
import { call } from '@/utils/apiError';

export { HOME_FOR_ROLE, ADMIN_ROLES } from '@/controllers/authController';

type AuthValue = {
  session: Session | null;
  user: Session['user'] | null;
  role: authController.Role | null;
  isAuthed: boolean;
  /** False until the stored session has been read, so guards do not bounce a signed-in user. */
  ready: boolean;
  login: (email: string, password: string) => Promise<Session>;
  register: (input: { email: string; password: string; fullName?: string }) => Promise<{ session: Session | null }>;
  loginCashier: (branchId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    authController.getSession().then((s) => {
      setSession(s);
      setReady(true);
    });
    // Also fires when another tab signs in or out, and on every token refresh.
    const { data } = authController.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password: string) => call(authController.login(email, password)), []);

  const register = useCallback(
    async ({ email, password, fullName }: { email: string; password: string; fullName?: string }) =>
      call(authController.register(email, password, fullName)),
    [],
  );

  // Each branch has its own register login; the server checks it and hands back a session.
  const loginCashier = useCallback(async (branchId: string, password: string) => {
    const tokens = await call(loginCashierAction({ branch_id: branchId, password }));
    await call(authController.adoptSession(tokens));
  }, []);

  const logout = useCallback(async () => {
    await authController.logout();
    setSession(null);
    window.dispatchEvent(new Event(LOGOUT_EVENT));
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      role: authController.roleOf(session),
      isAuthed: Boolean(session?.access_token),
      ready,
      login,
      register,
      loginCashier,
      logout,
    }),
    [session, ready, login, register, loginCashier, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext) as AuthValue;

/** The current access token, for server actions that must know who is calling. */
export const accessToken = async () => (await authController.getSession())?.access_token ?? null;
