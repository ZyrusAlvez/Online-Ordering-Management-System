import { createAnonClient, supabaseAdmin } from '../config/supabase.js';
import { ROLES } from '../constants/orders.js';
import { ApiError, fromPostgrestError } from '../utils/ApiError.js';
import { findUserByEmail } from '../utils/findUser.js';

/**
 * A user's role lives in two places and both must agree:
 *   - auth.users.app_metadata.role — travels in the JWT, so it is what
 *     requireRole() and the auth_role() RLS helper actually read.
 *   - profiles.role — the queryable copy, so admin screens can list riders.
 *
 * Writing only one lets them drift, which shows up as a user who passes
 * requireRole but is invisible to the admin list (or vice versa). Every role
 * change goes through here.
 */
export const setUserRole = async (userId, role) => {
  if (!ROLES.includes(role)) throw ApiError.badRequest(`Unknown role: ${role}`);

  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: { role },
  });
  if (authError) throw new ApiError(authError.status ?? 500, authError.message);

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .maybeSingle();

  if (error) throw fromPostgrestError(error);
  if (!data) throw ApiError.notFound('Profile not found');

  return data;
};

/**
 * Creates a staff-side account (cashier, rider, admin). These are never
 * self-registered — an admin creates them, so the email is pre-confirmed.
 * Returns the profile. Idempotent on email: an existing user has its role
 * corrected rather than erroring.
 */
export const createStaffUser = async ({ email, password, role, fullName, phone }) => {
  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { full_name: fullName ?? null },
  });

  let userId = created?.user?.id;

  if (error) {
    // Already registered — find them and fix up the role instead of failing.
    if (!/already|registered|exists/i.test(error.message)) {
      throw new ApiError(error.status ?? 400, error.message);
    }
    userId = (await findUserByEmail(email))?.id;
    if (!userId) throw new ApiError(error.status ?? 400, error.message);
  }

  // The on_auth_user_created trigger has already inserted the profile row.
  if (phone || fullName) {
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        ...(phone ? { phone } : {}),
        ...(fullName ? { full_name: fullName } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
    if (profileError) throw fromPostgrestError(profileError);
  }

  return setUserRole(userId, role);
};

/** Lists profiles, optionally filtered by role. Admin-facing. */
export const listProfiles = async ({ role, page = 1, limit = 20 } = {}) => {
  const from = (page - 1) * limit;

  let query = supabaseAdmin
    .from('profiles')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id')
    .range(from, from + limit - 1);

  if (role) query = query.eq('role', role);

  const { data, error, count } = await query;
  if (error) throw fromPostgrestError(error);

  return { data, total: count ?? 0 };
};

/** Update a rider's own profile fields. Scoped to role so it cannot hit staff. */
export const updateRider = async (riderId, payload) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', riderId)
    .eq('role', 'rider')
    .select()
    .maybeSingle();

  if (error) throw fromPostgrestError(error);
  if (!data) throw ApiError.notFound('Rider not found');

  return data;
};

// ---------------------------------------------------------------------------
// Self-service profile
// ---------------------------------------------------------------------------

const PROFILE_COLUMNS = 'id, full_name, phone, default_address';

/** Accounts created through Google have no email/password identity, so no password to change. */
const hasPassword = (user) => (user.identities ?? []).some((i) => i.provider === 'email');

const shape = (user, profile) => ({
  id: user.id,
  email: user.email,
  full_name: profile?.full_name ?? null,
  phone: profile?.phone ?? null,
  default_address: profile?.default_address ?? null,
  role: user.app_metadata?.role ?? 'customer',
  sign_in_method: hasPassword(user) ? 'email' : 'google',
  can_change_password: hasPassword(user),
  avatar_url: user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null,
});

export const getOwnProfile = async (user) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);

  return shape(user, data);
};

/**
 * Edits the caller's own name, phone and saved address. The columns are
 * whitelisted by the validator, and the update is keyed to the caller's id, so
 * nobody edits anyone else or their own role.
 */
export const updateOwnProfile = async (user, payload) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', user.id)
    .select(PROFILE_COLUMNS)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!data) throw ApiError.notFound('Profile not found');

  // Orders read the customer's name from user_metadata, so keep it in step.
  // Merge rather than replace: Google stores the avatar there too.
  if (payload.full_name) {
    const { error: metaError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, full_name: payload.full_name },
    });
    if (metaError) throw new ApiError(metaError.status ?? 500, metaError.message);
  }

  return shape({ ...user, user_metadata: { ...user.user_metadata, full_name: payload.full_name } }, data);
};

export const changeOwnPassword = async (user, { currentPassword, newPassword }) => {
  if (!hasPassword(user)) {
    throw ApiError.badRequest('This account signs in with Google, so it has no password to change');
  }
  // The shared cashier login is the employee password; admins change it from Settings.
  if (user.app_metadata?.role === 'cashier') {
    throw ApiError.forbidden('The cashier password is changed by an admin');
  }

  // 400, not 401: the frontend treats any 401 as an expired session and signs the user out.
  const { error: verifyError } = await createAnonClient().auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) throw ApiError.badRequest('Current password is incorrect');

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, { password: newPassword });
  if (error) throw new ApiError(error.status ?? 400, error.message);
};
