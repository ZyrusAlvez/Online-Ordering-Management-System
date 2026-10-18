// Gives every menu product a placeholder photo, uploaded to Supabase Storage.
//
// supabase/seed-data/product-images.json maps product name -> a Wikimedia Commons photo (with
// its license and author, which must be credited if the site is public). These are stand-ins:
// replace them per product from the admin Menu page. Products that already have an image are
// left alone unless --force is passed.
//
//   npm run seed:product-images [-- --force]

import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/utils/supabaseAdmin';

const force = process.argv.includes('--force');
const manifest = JSON.parse(await readFile('supabase/seed-data/product-images.json', 'utf8'));

const { data: products, error } = await supabaseAdmin.from('products').select('id, name, image_url');
if (error) throw error;

let done = 0;
let skipped = 0;
for (const product of products ?? []) {
  const entry = manifest[product.name];
  if (!entry) continue;
  if (product.image_url && !force) {
    skipped += 1;
    continue;
  }
  const res = await fetch(entry.source, { headers: { 'User-Agent': 'OrderingSystemSeed/1.0 (menu image seeding)' } });
  if (!res.ok) {
    console.error(`✗ ${product.name}: download failed (${res.status})`);
    continue;
  }
  const type = res.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
  const ext = { 'image/png': 'png', 'image/webp': 'webp' }[type] ?? 'jpg';
  const path = `products/${product.id}/${randomUUID()}.${ext}`;
  const { error: upError } = await supabaseAdmin.storage
    .from('menu-images')
    .upload(path, Buffer.from(await res.arrayBuffer()), { contentType: type });
  if (upError) {
    console.error(`✗ ${product.name}: upload failed (${upError.message})`);
    continue;
  }
  const url = supabaseAdmin.storage.from('menu-images').getPublicUrl(path).data.publicUrl;
  await supabaseAdmin.from('products').update({ image_url: url }).eq('id', product.id);
  done += 1;
  console.log(`✓ ${product.name}`);
  await new Promise((r) => setTimeout(r, 1200)); // Wikimedia rate-limits bursts
}
console.log(`\n${done} uploaded, ${skipped} already had an image.`);
