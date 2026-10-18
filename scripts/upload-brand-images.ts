// Uploads the bundled logo (public/brand/logo.jpg) to Supabase Storage and points site_images at
// it, so the super admin can later replace it from the dashboard. Only fills it if unset; pass
// --force to overwrite.
//
//   npm run seed:brand [-- --force]

import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/utils/supabaseAdmin';

const force = process.argv.includes('--force');
const { data: rows } = await supabaseAdmin.from('site_images').select('key, image_url');
const current = Object.fromEntries((rows ?? []).map((r) => [r.key, r.image_url]));

for (const key of ['logo']) {
  if (current[key] && !force) {
    console.log(`- ${key.padEnd(6)} already set, skipping (use --force to replace)`);
    continue;
  }
  const path = `site/${key}/${randomUUID()}.jpg`;
  const { error } = await supabaseAdmin.storage
    .from('menu-images')
    .upload(path, await readFile(`public/brand/${key}.jpg`), { contentType: 'image/jpeg' });
  if (error) throw error;
  const url = supabaseAdmin.storage.from('menu-images').getPublicUrl(path).data.publicUrl;
  await supabaseAdmin.from('site_images').upsert({ key, image_url: url, updated_at: new Date().toISOString() });
  console.log(`✓ ${key.padEnd(6)} ${url}`);
}
