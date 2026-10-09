import { createAnonClient, supabaseAdmin } from '../config/supabase.js';
import { ROLES } from '../constants/orders.js';
import { ApiError, fromPostgrestError } from '../utils/ApiError.js';
import { assertBranchAccess, canAccessBranch } from '../utils/branchScope.js';
import { findUserByEmail } from '../utils/findUser.js';
import { branchIdsOf, listBranches, setStaffBranches } from './branch.service.js';

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
    const existing = await findUserByEmail(email);
    if (!existing) throw new ApiError(error.status ?? 400, error.message);
    // Never quietly demote a super admin by "creating" a staff account on their email.
    if (existing.app_metadata?.role === 'super_admin' && role !== 'super_admin') {
      throw ApiError.conflict('That email belongs to a super admin');
    }
    userId = existing.id;
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

const WITH_BRANCHES = 'branch_staff(branch:branches(id, code, name))';

/** Replaces the raw join rows with a plain `branches` list. */
const withBranches = ({ branch_staff: staff, scope: _scope, ...profile }) => ({
  ...profile,
  branches: (staff ?? []).map((row) => row.branch).filter(Boolean),
});

/**
 * Lists staff profiles by role, each with its branches. `branchIds` limits the
 * list to people working at any of those branches (null = no limit).
 */
export const listProfiles = async ({ roles, branchIds = null, page = 1, limit = 20 } = {}) => {
  if (branchIds && branchIds.length === 0) return { data: [], total: 0 };
  const from = (page - 1) * limit;

  let query = supabaseAdmin
    .from('profiles')
    .select(branchIds ? `*, scope:branch_staff!inner(branch_id), ${WITH_BRANCHES}` : `*, ${WITH_BRANCHES}`, {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .order('id')
    .range(from, from + limit - 1);

  if (roles) query = query.in('role', roles);
  if (branchIds) query = query.in('scope.branch_id', branchIds);

  const { data, error, count } = await query;
  if (error) throw fromPostgrestError(error);

  return { data: data.map(withBranches), total: count ?? 0 };
};

const getStaffProfile = async (id, roles) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(`*, ${WITH_BRANCHES}`)
    .eq('id', id)
    .in('role', roles)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  return data && withBranches(data);
};

const updateProfileRow = async (id, fields) => {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw fromPostgrestError(error);
};

/** Creates a rider who delivers for one branch. */
export const createRider = async ({ branchId, ...account }) => {
  const profile = await createStaffUser({ ...account, role: 'rider' });
  await setStaffBranches(profile.id, [branchId]);
  return getStaffProfile(profile.id, ['rider']);
};

/**
 * Update a rider. Scoped to the rider role so it cannot hit other staff, and to
 * the caller's branches: a rider of another branch is "not found".
 */
export const updateRider = async (riderId, { branch_id: branchId, ...fields }, scope) => {
  const rider = await getStaffProfile(riderId, ['rider']);
  if (!rider || !rider.branches.some((b) => canAccessBranch(scope, b.id))) {
    throw ApiError.notFound('Rider not found');
  }

  if (branchId) {
    assertBranchAccess(scope, branchId);
    await setStaffBranches(riderId, [branchId]);
  }
  await updateProfileRow(riderId, fields);

  return getStaffProfile(riderId, ['rider']);
};

// ---------------------------------------------------------------------------
// Admin accounts (managed by the super admin)
// ---------------------------------------------------------------------------

export const listAdmins = ({ page, limit }) =>
  listProfiles({ roles: ['admin', 'super_admin'], page, limit });

export const createAdmin = async ({ branchIds, ...account }) => {
  const profile = await createStaffUser({ ...account, role: 'admin' });
  await setStaffBranches(profile.id, branchIds);
  return getStaffProfile(profile.id, ['admin']);
};

/** Branch admins only: a super admin's access is not edited from this screen. */
export const updateAdmin = async (adminId, { branch_ids: branchIds, ...fields }) => {
  const admin = await getStaffProfile(adminId, ['admin']);
  if (!admin) throw ApiError.notFound('Admin not found');

  if (branchIds) await setStaffBranches(adminId, branchIds);
  await updateProfileRow(adminId, fields);

  return getStaffProfile(adminId, ['admin']);
};

// ---------------------------------------------------------------------------
// Self-service profile
// ---------------------------------------------------------------------------

const PROFILE_COLUMNS = 'id, full_name, phone, default_address';

/** Accounts created through Google have no email/password identity, so no password to change. */
const hasPassword = (user) => (user.identities ?? []).some((i) => i.provider === 'email');

/** Branches the account works at, for staff screens (every branch for a super admin). */
const ownBranches = async (user) => {
  const role = user.app_metadata?.role;
  if (role === 'super_admin') return listBranches({ activeOnly: false });
  if (['admin', 'cashier', 'rider'].includes(role)) {
    const ids = await branchIdsOf(user.id);
    return ids.length ? listBranches({ activeOnly: false, ids }) : [];
  }
  return [];
};

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

  return { ...shape(user, data), branches: await ownBranches(user) };
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
