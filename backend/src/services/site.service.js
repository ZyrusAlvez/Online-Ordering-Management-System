import { supabaseAdmin, supabaseAnon } from '../config/supabase.js';
import { fromPostgrestError } from '../utils/ApiError.js';
import { removeImage, uploadImage } from './storage.service.js';

const TABLE = 'site_images';

export const getSiteImages = async () => {
  const { data, error } = await supabaseAnon.from(TABLE).select('key, image_url');
  if (error) throw fromPostgrestError(error);
  return Object.fromEntries(data.map((row) => [row.key, row.image_url]));
};

const writeUrl = async (key, imageUrl) => {
  const { error } = await supabaseAdmin
    .from(TABLE)
    .upsert({ key, image_url: imageUrl, updated_at: new Date().toISOString() });
  if (error) throw fromPostgrestError(error);
};

export const setSiteImage = async (key, body) => {
  const previous = (await getSiteImages())[key];
  const url = await uploadImage(`site/${key}`, body);
  await writeUrl(key, url);
  await removeImage(previous);
  return getSiteImages();
};

export const clearSiteImage = async (key) => {
  const previous = (await getSiteImages())[key];
  await writeUrl(key, null);
  await removeImage(previous);
  return getSiteImages();
};
