import { supabaseAnon, supabaseForToken } from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const bearerToken = (req) => {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
};

/**
 * Validates the caller's Supabase access token and attaches:
 *   req.user     — the Supabase auth user
 *   req.token    — the raw access token
 *   req.supabase — a client scoped to the caller, so RLS applies
 */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = bearerToken(req);
  if (!token) throw ApiError.unauthorized('Missing bearer token');

  const { data, error } = await supabaseAnon.auth.getUser(token);
  if (error || !data?.user) throw ApiError.unauthorized('Invalid or expired token');

  req.token = token;
  req.user = data.user;
  req.supabase = supabaseForToken(token);
  next();
});

/**
 * Restricts a route to the given roles. Reads the role from the user's
 * app_metadata.role (set server-side) and falls back to user_metadata.role.
 */
export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());

    const role = req.user.app_metadata?.role ?? req.user.user_metadata?.role;
    if (!role || !roles.includes(role)) {
      return next(ApiError.forbidden(`Requires role: ${roles.join(', ')}`));
    }
    next();
  };
