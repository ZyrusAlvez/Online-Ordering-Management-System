import { supabase } from '@/utils/supabase';

export const MENU_BUCKET = 'menu-images';
export const RECEIPT_BUCKET = 'payment-receipts';
export const CHAT_BUCKET = 'chat-images';

// Every upload gets a new random path, so a file at a given path never changes: public images can
// be cached by browsers for a year. Private ones (receipts, chat photos) keep a short lifetime.
export const upload = (bucket: string, path: string, file: Blob) =>
  supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    upsert: false,
    cacheControl: bucket === MENU_BUCKET ? '31536000' : '3600',
  });

export const remove = (bucket: string, paths: string[]) => supabase.storage.from(bucket).remove(paths);

export const publicUrl = (bucket: string, path: string) => supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

export const signedUrls = (bucket: string, paths: string[], seconds: number) =>
  supabase.storage.from(bucket).createSignedUrls(paths, seconds);

export const list = (bucket: string, folder: string, limit: number) =>
  supabase.storage.from(bucket).list(folder, { limit });
