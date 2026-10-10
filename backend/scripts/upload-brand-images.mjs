/**
 * Uploads the bundled logo (frontend/public/brand/logo.jpg) to Supabase Storage
 * and points site_images at it, so the super admin can later replace it from the
 * dashboard. Only fills it if it has not been set yet; pass --force to overwrite.
 *
 *   npm run seed:brand
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getSiteImages, setSiteImage } from '../src/services/site.service.js';

const force = process.argv.includes('--force');
const brandDir = new URL('../../frontend/public/brand/', import.meta.url);

const current = await getSiteImages();

for (const key of ['logo']) {
  if (current[key] && !force) {
    console.log(`- ${key.padEnd(6)} already set, skipping (use --force to replace)`);
    continue;
  }
  const file = new URL(`${key}.jpg`, brandDir);
  const images = await setSiteImage(key, await readFile(fileURLToPath(file)));
  console.log(`✓ ${key.padEnd(6)} ${images[key]}`);
}
