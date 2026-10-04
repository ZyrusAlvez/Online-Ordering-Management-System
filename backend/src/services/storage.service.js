import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';

export const IMAGE_BUCKET = 'menu-images';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const bucket = () => supabaseAdmin.storage.from(IMAGE_BUCKET);

/**
 * Identifies the image by its leading bytes rather than trusting the
 * Content-Type header, so a mislabelled file is rejected instead of stored.
 */
const sniff = (b) => {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
};

/** Uploads under `folder/` with a fresh name each time, so replaced images are never served stale from a CDN. */
export const uploadImage = async (folder, body) => {
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw ApiError.badRequest(
      'Send the image as the raw request body with Content-Type image/jpeg, image/png or image/webp',
    );
  }
  const type = sniff(body);
  if (!type) throw ApiError.badRequest('Unsupported image. Use JPEG, PNG or WebP.');

  const path = `${folder}/${randomUUID()}.${type.ext}`;
  const { error } = await bucket().upload(path, body, { contentType: type.mime, cacheControl: '31536000' });
  if (error) throw new ApiError(500, `Image upload failed: ${error.message}`);

  return bucket().getPublicUrl(path).data.publicUrl;
};

/** Deletes the stored object behind a public URL. Ignores URLs that are not ours (e.g. a pasted external link). */
export const removeImage = async (url) => {
  const marker = `/object/public/${IMAGE_BUCKET}/`;
  const at = url?.indexOf(marker) ?? -1;
  if (at === -1) return;

  const path = decodeURIComponent(url.slice(at + marker.length).split('?')[0]);
  // Best effort: an orphaned file is harmless, a failed delete must not fail the edit.
  await bucket().remove([path]);
};
