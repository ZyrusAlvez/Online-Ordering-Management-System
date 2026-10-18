import { getGcashAccount } from '@/controllers/siteController';

/** The GCash account customers pay into ({ name, number, qr_image }), or null when GCash is off. */
export function useGcashAccount() {
  return getGcashAccount();
}
