/**
 * Gives every menu product a placeholder photo, uploaded to Supabase Storage.
 *
 * supabase/seed-data/product-images.json maps product name -> a Wikimedia
 * Commons photo (with its license and author, which must be credited if the
 * site is public). These are stand-ins: replace them per product from the
 * admin Menu page.
 *
 * Products that already have an image are left alone unless --force is passed,
 * so this never overwrites a photo the admin chose.
 *
 *   npm run seed:product-images
 */

import { readFile } from 'node:fs/promises';
import { supabaseAdmin } from '../src/config/supabase.js';
import { setProductImage } from '../src/services/catalog.service.js';

const force = process.argv.includes('--force');
const manifest = JSON.parse(
  await readFile(new URL('../supabase/seed-data/product-images.json', import.meta.url), 'utf8'),
);

const { data: products, error } = await supabaseAdmin.from('products').select('id, name, image_url');
if (error) throw error;

let done = 0;
let skipped = 0;

for (const product of products) {
  const entry = manifest[product.name];
  if (!entry) continue;
  if (product.image_url && !force) {
    skipped += 1;
    continue;
  }

  const res = await fetch(entry.source, {
    headers: { 'User-Agent': 'OrderingSystemSeed/1.0 (menu image seeding)' },
  });
  if (!res.ok) {
    console.error(`✗ ${product.name}: download failed (${res.status})`);
    continue;
  }
  await setProductImage(product.id, Buffer.from(await res.arrayBuffer()));
  done += 1;
  console.log(`✓ ${product.name}`);
  // Wikimedia rate-limits bursts.
  await new Promise((r) => setTimeout(r, 1200));
}

console.log(`\n${done} uploaded, ${skipped} already had an image.`);
