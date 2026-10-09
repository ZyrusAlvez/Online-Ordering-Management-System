import { supabaseAdmin } from '../config/supabase.js';
import { ApiError, fromPostgrestError } from '../utils/ApiError.js';

const TABLE = 'branches';
const STAFF = 'branch_staff';

export const BRANCH_COLUMNS =
  'id, code, name, address, phone, latitude, longitude, opens_at, closes_at, is_active';

/** Postgres returns time as "08:00:00" and numeric as strings; the API speaks "08:00" and numbers. */
export const shapeBranch = (row) =>
  row && {
    ...row,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    opens_at: row.opens_at?.slice(0, 5) ?? null,
    closes_at: row.closes_at?.slice(0, 5) ?? null,
  };

export const listBranches = async ({ activeOnly = true, ids = null } = {}) => {
  let query = supabaseAdmin.from(TABLE).select(BRANCH_COLUMNS).order('name');
  if (activeOnly) query = query.eq('is_active', true);
  if (ids) query = query.in('id', ids);

  const { data, error } = await query;
  if (error) throw fromPostgrestError(error);
  return data.map(shapeBranch);
};

export const getBranch = async (id) => {
  const { data, error } = await supabaseAdmin.from(TABLE).select(BRANCH_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw fromPostgrestError(error);
  return shapeBranch(data);
};

export const getBranchOrFail = async (id) => {
  const branch = await getBranch(id);
  if (!branch) throw ApiError.notFound('Branch not found');
  return branch;
};

/** For customer-facing actions: a deactivated branch takes no new orders or chats. */
export const getActiveBranchOrFail = async (id) => {
  const branch = await getBranch(id);
  if (!branch || !branch.is_active) throw ApiError.badRequest('That branch is not taking orders');
  return branch;
};

// ---------------------------------------------------------------------------
// Staff assignments
// ---------------------------------------------------------------------------

/** The branch ids a staff account works at. */
export const branchIdsOf = async (profileId) => {
  const { data, error } = await supabaseAdmin.from(STAFF).select('branch_id').eq('profile_id', profileId);
  if (error) throw fromPostgrestError(error);
  return data.map((row) => row.branch_id);
};

/** Replaces a staff account's branches with exactly `branchIds`. */
export const setStaffBranches = async (profileId, branchIds) => {
  const wanted = [...new Set(branchIds)];

  const { error: insertError } = await supabaseAdmin
    .from(STAFF)
    .upsert(
      wanted.map((branchId) => ({ profile_id: profileId, branch_id: branchId })),
      { onConflict: 'profile_id,branch_id', ignoreDuplicates: true },
    );
  if (insertError) throw fromPostgrestError(insertError);

  // Remove the rest only after the new rows exist, so a failure never leaves
  // someone with no branch at all.
  let remove = supabaseAdmin.from(STAFF).delete().eq('profile_id', profileId);
  if (wanted.length) remove = remove.not('branch_id', 'in', `(${wanted.join(',')})`);
  const { error } = await remove;
  if (error) throw fromPostgrestError(error);
};

/** The staff account of `role` assigned to a branch (the branch's shared cashier). */
export const staffOfBranch = async (branchId, role) => {
  const { data, error } = await supabaseAdmin
    .from(STAFF)
    .select('profile_id, profile:profiles!inner(id, role)')
    .eq('branch_id', branchId)
    .eq('profile.role', role)
    .limit(1)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  return data?.profile_id ?? null;
};
