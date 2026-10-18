import { supabase } from '@/utils/supabase';

export const getSiteImages = () => supabase.from('site_images').select('key, image_url');

export const upsertSiteImage = (key: string, imageUrl: string | null) =>
  supabase.from('site_images').upsert({ key, image_url: imageUrl, updated_at: new Date().toISOString() });
