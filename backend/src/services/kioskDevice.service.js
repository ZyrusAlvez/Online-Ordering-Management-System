import { supabaseAdmin } from '../config/supabase.js';
import { generateKioskKey, hashKioskKey } from '../middleware/kiosk.js';
import { ApiError, fromPostgrestError } from '../utils/ApiError.js';

const TABLE = 'kiosk_devices';

/** key_hash is never selected — only the prefix, to identify the device. */
const SAFE_COLUMNS =
  'id, name, key_prefix, is_active, last_seen_at, created_at, branch_id, branch:branches(id, code, name)';

/** Devices at the given branches (null = every branch). */
export const listKioskDevices = async ({ branchIds = null } = {}) => {
  if (branchIds && branchIds.length === 0) return [];

  let query = supabaseAdmin.from(TABLE).select(SAFE_COLUMNS).order('created_at', { ascending: false });
  if (branchIds) query = query.in('branch_id', branchIds);

  const { data, error } = await query;
  if (error) throw fromPostgrestError(error);
  return data;
};

/**
 * Issue a device key. The raw key is returned exactly once and is not
 * recoverable afterwards — only its hash is stored.
 */
export const issueKioskDevice = async (name, branchId) => {
  const key = generateKioskKey();

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert({ name, branch_id: branchId, key_hash: hashKioskKey(key), key_prefix: key.slice(0, 14) })
    .select(SAFE_COLUMNS)
    .single();

  if (error) throw fromPostgrestError(error);

  return { ...data, key, warning: 'Copy this key now — it cannot be retrieved again.' };
};

/**
 * Revoke a device. The row is kept so past orders keep their reference.
 * `branchIds` (null = any) keeps an admin to their own branches' devices.
 */
export const revokeKioskDevice = async (id, { branchIds = null } = {}) => {
  let query = supabaseAdmin.from(TABLE).update({ is_active: false }).eq('id', id);
  if (branchIds) query = query.in('branch_id', branchIds);

  const { data, error } = await query.select('id').maybeSingle();

  if (error) throw fromPostgrestError(error);
  if (!data) throw ApiError.notFound('Kiosk device not found');
};
