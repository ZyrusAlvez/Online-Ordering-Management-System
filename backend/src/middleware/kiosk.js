import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const KIOSK_KEY_HEADER = 'x-kiosk-key';

/** Keys are stored only as a hash, so a database leak does not yield live keys. */
export const hashKioskKey = (key) => createHash('sha256').update(key, 'utf8').digest('hex');

/** `kiosk_<32 url-safe chars>` — the prefix makes keys recognisable in logs. */
export const generateKioskKey = () => `kiosk_${randomBytes(24).toString('base64url')}`;

/**
 * Authenticates a kiosk terminal by its device key.
 *
 * A kiosk has no logged-in user — it is a public terminal — so it presents a
 * per-device key instead. That key identifies which terminal placed an order,
 * can be revoked individually, and is rate-limited per device.
 *
 * Note this key necessarily ships to the client in a browser-based kiosk, so
 * treat it as a revocable device identifier rather than a true secret.
 */
export const requireKiosk = asyncHandler(async (req, _res, next) => {
  const presented = req.get(KIOSK_KEY_HEADER);
  if (!presented) throw ApiError.unauthorized('Missing kiosk device key');

  const { data: device, error } = await supabaseAdmin
    .from('kiosk_devices')
    .select('id, name, is_active, key_hash, branch_id, branch:branches(id, code, name)')
    .eq('key_hash', hashKioskKey(presented))
    .maybeSingle();

  if (error) throw ApiError.internal('Could not verify kiosk device');
  if (!device) throw ApiError.unauthorized('Unknown kiosk device key');
  if (!device.is_active) throw ApiError.forbidden('This kiosk device has been deactivated');

  // The lookup above already matched on the hash; this compare is a guard
  // against a future refactor reintroducing a non-constant-time path.
  const a = Buffer.from(device.key_hash, 'hex');
  const b = Buffer.from(hashKioskKey(presented), 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw ApiError.unauthorized('Unknown kiosk device key');
  }

  // Every kiosk order goes to the branch the device was unlocked for.
  req.kiosk = { id: device.id, name: device.name, branch_id: device.branch_id, branch: device.branch };

  // Liveness for the admin screen; never block the request on it.
  supabaseAdmin
    .from('kiosk_devices')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', device.id)
    .then(() => {}, () => {});

  next();
});
