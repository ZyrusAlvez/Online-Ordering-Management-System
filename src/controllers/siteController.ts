import * as siteModel from '@/models/siteModel';
import { removePublicImage, uploadPublicImage } from '@/controllers/storageController';
import { fail, fromDbError, ok, type Result } from '@/utils/result';
import { cached, invalidate } from '@/utils/cache';

export type SiteImages = Record<string, string | null>;
export const SITE_IMAGE_KEYS = ['logo'] as const;

export const getSiteImages = (): Promise<Result<SiteImages>> =>
  cached('site:images', 'public', async () => {
    const { data, error } = await siteModel.getSiteImages();
    if (error) return fromDbError(error, 'Failed to load images');
    return ok(Object.fromEntries((data ?? []).map((row) => [row.key, row.image_url])));
  });

const assertKey = (key: string) => (SITE_IMAGE_KEYS as readonly string[]).includes(key);

export const setSiteImage = async (key: string, file: Blob): Promise<Result<SiteImages>> => {
  if (!assertKey(key)) return fail('Unknown image', 404);
  const current = await getSiteImages();
  const uploaded = await uploadPublicImage(`site/${key}`, file);
  if (uploaded.success === false) return uploaded;
  const { error } = await siteModel.upsertSiteImage(key, uploaded.data);
  if (error) {
    await removePublicImage(uploaded.data);
    return fromDbError(error, 'Failed to save the image');
  }
  if (current.success) await removePublicImage(current.data[key]);
  invalidate('site:');
  return getSiteImages();
};

export const clearSiteImage = async (key: string): Promise<Result<SiteImages>> => {
  if (!assertKey(key)) return fail('Unknown image', 404);
  const current = await getSiteImages();
  const { error } = await siteModel.upsertSiteImage(key, null);
  if (error) return fromDbError(error, 'Failed to remove the image');
  if (current.success) await removePublicImage(current.data[key]);
  invalidate('site:');
  return getSiteImages();
};

export type GcashAccount = { name: string; number: string; qr_image: string | null };

/** The GCash account customers pay into, or null when GCash is switched off. */
export const getGcashAccount = (): GcashAccount | null => {
  const number = process.env.NEXT_PUBLIC_GCASH_NUMBER;
  if (!number) return null;
  return {
    name: process.env.NEXT_PUBLIC_GCASH_NAME ?? '',
    number,
    qr_image: process.env.NEXT_PUBLIC_GCASH_QR_IMAGE || null,
  };
};
