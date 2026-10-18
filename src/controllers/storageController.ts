import * as storageModel from '@/models/storageModel';
import { fail, ok, type Result } from '@/utils/result';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Reads the file's first bytes: the declared type alone is whatever the browser claims. */
const sniff = async (file: Blob): Promise<string | null> => {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return 'image/webp';
  }
  return null;
};

export const checkImage = async (file: Blob): Promise<Result<string>> => {
  if (file.size > MAX_IMAGE_BYTES) return fail('Images must be 5 MB or smaller', 413);
  const type = await sniff(file);
  if (!type) return fail('Use a JPG, PNG or WebP image', 415);
  return ok(EXTENSIONS[type]);
};

/** Uploads under `<folder>/<uuid>.<ext>` and returns the stored path. */
export const uploadImage = async (bucket: string, folder: string, file: Blob): Promise<Result<string>> => {
  const checked = await checkImage(file);
  if (checked.success === false) return checked;
  const path = `${folder}/${crypto.randomUUID()}.${checked.data}`;
  const { error } = await storageModel.upload(bucket, path, file);
  if (error) return fail('Could not upload the image', 500);
  return ok(path);
};

/** Public menu/logo images: returns the public URL. */
export const uploadPublicImage = async (folder: string, file: Blob): Promise<Result<string>> => {
  const uploaded = await uploadImage(storageModel.MENU_BUCKET, folder, file);
  if (uploaded.success === false) return uploaded;
  return ok(storageModel.publicUrl(storageModel.MENU_BUCKET, uploaded.data));
};

/** Removes a public image by its URL (best effort; an orphaned file is harmless). */
export const removePublicImage = async (url: string | null | undefined) => {
  const marker = `/object/public/${storageModel.MENU_BUCKET}/`;
  const at = url?.indexOf(marker) ?? -1;
  if (!url || at < 0) return;
  await storageModel.remove(storageModel.MENU_BUCKET, [url.slice(at + marker.length)]).catch(() => {});
};

/** Short-lived links for private images (receipts, chat photos). */
export const signedUrlMap = async (bucket: string, paths: (string | null | undefined)[], seconds = 3600) => {
  const wanted = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (!wanted.length) return new Map<string, string>();
  const { data } = await storageModel.signedUrls(bucket, wanted, seconds);
  return new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl]));
};
