import { supabaseAdmin, supabaseAnon } from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';

/** Supabase auth errors carry their own HTTP status; preserve it. */
const rethrow = (error, fallbackStatus = 400) => {
  throw new ApiError(error.status ?? fallbackStatus, error.message);
};

/**
 * Self-registration. The role is NOT settable here — new accounts are always
 * customers; cashier, rider and admin accounts are created by an admin.
 */
export const register = async ({ email, password, fullName }) => {
  const { data, error } = await supabaseAnon.auth.signUp({
    email,
    password,
    options: { data: fullName ? { full_name: fullName } : undefined },
  });

  if (error) rethrow(error);
  return { user: data.user, session: data.session };
};

export const login = async ({ email, password }) => {
  const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });
  if (error) throw ApiError.unauthorized(error.message);

  return { user: data.user, session: data.session };
};

export const refresh = async (refreshToken) => {
  const { data, error } = await supabaseAnon.auth.refreshSession({ refresh_token: refreshToken });
  if (error) throw ApiError.unauthorized(error.message);

  return { user: data.user, session: data.session };
};

/** Revokes the caller's refresh token server-side. */
export const logout = async (accessToken) => {
  const { error } = await supabaseAdmin.auth.admin.signOut(accessToken);
  if (error) rethrow(error);
};
