import { supabaseAdmin } from '../config/supabase.js';
import { generateKioskKey, hashKioskKey } from '../middleware/kiosk.js';
import { ApiError, fromPostgrestError } from '../utils/ApiError.js';

const TABLE = 'kiosk_devices';

/** key_hash is never selected — only the prefix, to identify the device. */
const SAFE_COLUMNS = 'id, name, key_prefix, is_active, last_seen_at, created_at';

export const listKioskDevices = async () => {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select(SAFE_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) throw fromPostgrestError(error);
  return data;
};

/**
 * Issue a device key. The raw key is returned exactly once and is not
 * recoverable afterwards — only its hash is stored.
 */
export const issueKioskDevice = async (name) => {
  const key = generateKioskKey();

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert({ name, key_hash: hashKioskKey(key), key_prefix: key.slice(0, 14) })
    .select('id, name, key_prefix, is_active, created_at')
    .single();

  if (error) throw fromPostgrestError(error);

  return { ...data, key, warning: 'Copy this key now — it cannot be retrieved again.' };
};

/** Revoke a device. The row is kept so past orders keep their reference. */
export const revokeKioskDevice = async (id) => {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({ is_active: false })
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) throw fromPostgrestError(error);
  if (!data) throw ApiError.notFound('Kiosk device not found');
};
