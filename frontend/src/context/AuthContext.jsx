import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, keepSessionFresh } from '../lib/api.js';
import { LOGOUT_EVENT } from './CartContext.jsx';
import {
  clearSession,
  getSession,
  onSessionChange,
  roleOf,
  saveSession,
} from '../lib/session.js';

const AuthContext = createContext(null);

/** Where each role lands after signing in. */
export const HOME_FOR_ROLE = {
  customer: '/menu',
  rider: '/driver',
  admin: '/admin',
  super_admin: '/admin',
  cashier: '/cashier',
};

/** An admin manages its own branches; a super admin manages every branch. */
export const ADMIN_ROLES = ['admin', 'super_admin'];

export function AuthProvider({ children }) {
  const [session, setSession] = useState(getSession);

  useEffect(() => onSessionChange(setSession), []);
  useEffect(() => keepSessionFresh(), []);

  const login = useCallback(async (email, password) => {
    const result = await api.post('/auth/login', { email, password });
    saveSession(result);
    return result;
  }, []);

  const register = useCallback(async ({ email, password, fullName }) => {
    const result = await api.post('/auth/register', { email, password, fullName });
    // With email confirmation on, Supabase returns no session — the caller shows a notice.
    if (result.session) saveSession(result);
    return result;
  }, []);

  // Each branch has its own register login.
  const loginCashier = useCallback(async (branchId, password) => {
    const result = await api.post('/employee/cashier/login', { branch_id: branchId, password });
    saveSession(result);
    return result;
  }, []);

  const logout = useCallback(async () => {
    try {
      if (getSession()) await api.post('/auth/logout', undefined, { auth: true });
    } catch {
      // Signing out locally must always succeed.
    }
    clearSession();
    window.dispatchEvent(new Event(LOGOUT_EVENT));
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      role: roleOf(session),
      isAuthed: Boolean(session?.session?.access_token),
      login,
      register,
      loginCashier,
      logout,
    }),
    [session, login, register, loginCashier, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
