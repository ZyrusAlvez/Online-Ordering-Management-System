import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import * as kioskModel from '@/models/server/kioskModel';
import { fromDbError, ok } from '@/utils/result';

// Not a 'use server' file on purpose: every export of one is callable from any browser.
// These are only used by actions that have already checked who is calling.

export const hashKioskKey = (key: string) => createHash('sha256').update(key, 'utf8').digest('hex');

/** `kiosk_<32 url-safe chars>`: the prefix makes keys recognisable. */
const generateKioskKey = () => `kiosk_${randomBytes(24).toString('base64url')}`;

/** Issues a device key. The raw key is returned exactly once; only its hash is kept. */
export const issueKioskDevice = async (name: string, branchId: string) => {
  const key = generateKioskKey();
  const { data, error } = await kioskModel.insertDevice({
    name,
    branch_id: branchId,
    key_hash: hashKioskKey(key),
    key_prefix: key.slice(0, 14),
  });
  if (error) return fromDbError(error, 'Could not register the kiosk');
  return ok({ ...data, key, warning: 'Copy this key now — it cannot be retrieved again.' });
};
