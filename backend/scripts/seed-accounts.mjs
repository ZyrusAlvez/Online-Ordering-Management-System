#!/usr/bin/env node
// Creates the two staff accounts the system needs — the single admin and the
// shared POS cashier login — and records their passwords in .env so that
// `npm test` works with no further setup.
//
//   node --env-file=.env scripts/seed-accounts.mjs
//
// Safe to re-run. Password precedence, highest first:
//   1. SEED_ADMIN_PASSWORD / SEED_CASHIER_PASSWORD   — set explicitly
//   2. TEST_ADMIN_PASSWORD / TEST_CASHIER_PASSWORD   — already in .env
//   3. a newly generated random password
//
// Whichever wins is applied to the account AND written to .env, so the two can
// never drift apart. (Re-running used to print a fresh password without ever
// setting it on an existing account, leaving .env holding one that did not
// work.)

import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from '../src/config/supabase.js';
import { createStaffUser } from '../src/services/profile.service.js';
import { upsertEnv } from './lib/env-file.mjs';

const generatePassword = () => randomBytes(12).toString('base64url');

const accounts = [
  {
    label: 'Admin',
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@3k.local',
    role: 'admin',
    fullName: 'System Administrator',
    envKey: 'TEST_ADMIN_PASSWORD',
    explicit: process.env.SEED_ADMIN_PASSWORD,
  },
  {
    label: 'Cashier (shared POS login)',
    email: process.env.SEED_CASHIER_EMAIL ?? 'cashier@3k.local',
    role: 'cashier',
    fullName: 'POS Terminal',
    envKey: 'TEST_CASHIER_PASSWORD',
    explicit: process.env.SEED_CASHIER_PASSWORD,
  },
];

const generated = [];

for (const account of accounts) {
  const existing = process.env[account.envKey];
  const password = account.explicit || existing || generatePassword();
  const source = account.explicit ? 'explicit' : existing ? 'kept from .env' : 'generated';

  const profile = await createStaffUser({ ...account, password });

  // createStaffUser leaves an existing account's password alone, so set it
  // here — this is what guarantees .env and the account agree.
  const { error } = await supabaseAdmin.auth.admin.updateUserById(profile.id, { password });
  if (error) throw new Error(`Could not set password for ${account.email}: ${error.message}`);

  upsertEnv(account.envKey, password);

  console.log(
    `✓ ${account.label.padEnd(28)} ${account.email.padEnd(20)} role=${profile.role}  (${source})`,
  );
  if (source === 'generated') generated.push({ email: account.email, password });
}

console.log('\nPasswords saved to .env — `npm test` will pick them up automatically.');

if (generated.length) {
  console.log('\nNewly generated (also in .env):');
  for (const { email, password } of generated) console.log(`  ${email.padEnd(20)} ${password}`);
}
