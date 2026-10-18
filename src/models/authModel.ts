import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '@/utils/supabase';

export const signInWithPassword = (email: string, password: string) =>
  supabase.auth.signInWithPassword({ email, password });

export const signUp = (email: string, password: string, fullName?: string) =>
  supabase.auth.signUp({
    email,
    password,
    options: { data: fullName ? { full_name: fullName } : {} },
  });

export const signInWithGoogle = (redirectTo: string) =>
  supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });

export const exchangeCodeForSession = (code: string) => supabase.auth.exchangeCodeForSession(code);

/** Hands the browser a session minted on the server (the cashier gate). */
export const setSession = (accessToken: string, refreshToken: string) =>
  supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });

export const getSession = () => supabase.auth.getSession();

export const onAuthStateChange = (callback: (event: AuthChangeEvent, session: Session | null) => void) =>
  supabase.auth.onAuthStateChange(callback);

// 'local' ends only this device's session: the cashier login is shared by every register at a branch.
export const signOut = () => supabase.auth.signOut({ scope: 'local' });

export const getActiveFlag = (userId: string) =>
  supabase.from('profiles').select('is_active').eq('id', userId).maybeSingle();
