import { supabaseAdmin, supabaseAnon, supabaseForToken } from '../config/supabase.js';
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
 * Restricts a route to the given roles. The role is read ONLY from
 * app_metadata.role, which only the server can write. user_metadata is
 * editable by the user themself (supabase.auth.updateUser), so trusting it
 * would let anyone promote their own account to admin. No role means customer,
 * the same default as the auth_role() SQL helper that RLS uses.
 */
export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());

    const role = req.user.app_metadata?.role ?? 'customer';
    if (!roles.includes(role)) {
      return next(ApiError.forbidden(`Requires role: ${roles.join(', ')}`));
    }
    next();
  };

/**
 * Refuses accounts an admin has switched off. A rider's session keeps working
 * until it expires, so deactivating one must be checked on every request, not
 * just at login.
 */
export const requireActive = asyncHandler(async (req, _res, next) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('is_active')
    .eq('id', req.user.id)
    .maybeSingle();

  if (error) throw ApiError.internal('Could not verify the account');
  if (data && data.is_active === false) throw ApiError.forbidden('This account has been deactivated');
  next();
});
