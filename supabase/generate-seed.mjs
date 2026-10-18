#!/usr/bin/env node
// Regenerates supabase/seed.sql from supabase/seed-data/menu.json.
//
// Run after editing menu.json:
//   node supabase/generate-seed.mjs
//
// The output is idempotent (ON CONFLICT DO NOTHING against the unique
// constraints in the init migration), so re-running the seed is safe.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const menu = JSON.parse(readFileSync(join(here, 'seed-data/menu.json'), 'utf8'));

const sqlString = (value) => `'${String(value).replace(/'/g, "''")}'`;
const sqlNumber = (value) => (value == null ? 'null::numeric' : Number(value));

const lines = [
  '-- Generated from supabase/seed-data/menu.json by generate-seed.mjs.',
  '-- Do not hand-edit — change menu.json and regenerate instead.',
  '',
];

// --- categories ---------------------------------------------------------
lines.push('insert into public.categories (name, sort_order) values');
lines.push(
  menu.categories
    .map((cat, i) => `  (${sqlString(cat.category)}, ${i + 1})${i === menu.categories.length - 1 ? '' : ','}`)
    .join('\n'),
);
lines.push('on conflict (name) do nothing;', '');

// --- products + variants -------------------------------------------------
for (const cat of menu.categories) {
  const catRef = `(select id from public.categories where name = ${sqlString(cat.category)})`;
  lines.push(`-- ${cat.category}`);

  let sortOrder = 0;
  let softdrinksSortOrder = null; // sort_order reserved for the merged Softdrinks product
  let softdrinksVariantOrder = 0;

  for (const item of cat.items) {
    const isSoftdrinkSize = /Softdrinks$/i.test(item.name) && !item.price && !item.options && !item.sizes;

    if (isSoftdrinkSize) {
      const label = item.name.replace(/\s*Softdrinks$/i, '').trim();
      softdrinksVariantOrder += 1;

      if (softdrinksSortOrder === null) {
        softdrinksSortOrder = ++sortOrder;
        lines.push(
          `insert into public.products (category_id, name, sort_order) values (${catRef}, 'Softdrinks', ${softdrinksSortOrder})`,
          `on conflict (category_id, name) do nothing;`,
          '',
        );
      }

      lines.push(
        'insert into public.product_variants (product_id, label, price, sort_order)',
        'select p.id, v.label, v.price, v.sort_order',
        'from public.products p',
        `cross join (values (${sqlString(label)}, null::numeric, ${softdrinksVariantOrder})) as v(label, price, sort_order)`,
        `where p.category_id = ${catRef} and p.name = 'Softdrinks'`,
        'on conflict (product_id, label) do nothing;',
        '',
      );
      continue;
    }

    sortOrder += 1;
    const priced = item.options ?? item.sizes;

    if (priced) {
      lines.push(
        `insert into public.products (category_id, name, sort_order) values (${catRef}, ${sqlString(item.name)}, ${sortOrder})`,
        `on conflict (category_id, name) do nothing;`,
        '',
        'insert into public.product_variants (product_id, label, price, sort_order)',
        'select p.id, v.label, v.price, v.sort_order',
        'from public.products p',
        'cross join (values',
        priced
          .map((opt, i) => {
            const label = opt.size ?? opt.portion ?? String(i + 1);
            return `  (${sqlString(label)}, ${sqlNumber(opt.price)}, ${i + 1})${i === priced.length - 1 ? '' : ','}`;
          })
          .join('\n'),
        ') as v(label, price, sort_order)',
        `where p.category_id = ${catRef} and p.name = ${sqlString(item.name)}`,
        'on conflict (product_id, label) do nothing;',
        '',
      );
    } else {
      const customizations = item.customizations?.length
        ? `array[${item.customizations.map(sqlString).join(', ')}]`
        : `array[]::text[]`;

      lines.push(
        'insert into public.products (category_id, name, price, customizations, sort_order) values (',
        `  ${catRef}, ${sqlString(item.name)}, ${sqlNumber(item.price)}, ${customizations}, ${sortOrder}`,
        ')',
        'on conflict (category_id, name) do nothing;',
        '',
      );
    }
  }
}

writeFileSync(join(here, 'seed.sql'), lines.join('\n') + '\n');
console.log('Wrote supabase/seed.sql');
