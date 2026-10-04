const MAX_SIDE = 1600;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Downscales a picked image and re-encodes it as WebP (JPEG fallback), so a
 * multi-megabyte phone photo stays well under the 5 MB upload limit and menus
 * load quickly. Transparency is preserved.
 */
export async function prepareImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('That image could not be read. Try a JPEG, PNG or WebP.');
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
  if (!blob || !ALLOWED.includes(blob.type)) throw new Error('This browser could not process the image.');
  return blob;
}
