#!/usr/bin/env node
// Creates the two staff accounts the system needs — the super admin and the
// GMA Terminal branch's shared POS cashier login — and records their passwords
// in .env so that `npm test` works with no further setup. Other branches get
// their cashier account the first time an admin sets its password.
//
// Branches themselves come from the 20261010010000_branches.sql migration.
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
import { setStaffBranches } from '../src/services/branch.service.js';
import { setKioskPassword } from '../src/services/employee.service.js';
import { createStaffUser } from '../src/services/profile.service.js';
import { upsertEnv } from './lib/env-file.mjs';

const generatePassword = () => randomBytes(12).toString('base64url');

const { data: gma, error: branchError } = await supabaseAdmin
  .from('branches')
  .select('id, name')
  .eq('code', 'gma')
  .single();
if (branchError) throw new Error(`GMA Terminal branch not found — apply the migrations first (${branchError.message})`);

const accounts = [
  {
    label: 'Super admin',
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@3k.local',
    role: 'super_admin',
    fullName: 'System Administrator',
    envKey: 'TEST_ADMIN_PASSWORD',
    explicit: process.env.SEED_ADMIN_PASSWORD,
  },
  {
    label: 'Cashier (GMA shared login)',
    email: process.env.SEED_CASHIER_EMAIL ?? 'cashier@3k.local',
    role: 'cashier',
    fullName: 'GMA Terminal Cashier',
    branchId: gma.id,
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

  if (account.branchId) await setStaffBranches(profile.id, [account.branchId]);

  upsertEnv(account.envKey, password);

  console.log(
    `✓ ${account.label.padEnd(28)} ${account.email.padEnd(20)} role=${profile.role}  (${source})`,
  );
  if (source === 'generated') generated.push({ email: account.email, password });
}

// The kiosk gate password lives in employee_credentials, not in Supabase Auth.
// (The cashier gate password is the cashier account's password, set above.)
const kioskExisting = process.env.TEST_KIOSK_PASSWORD;
const kioskPassword = process.env.SEED_KIOSK_PASSWORD || kioskExisting || generatePassword();
const kioskSource = process.env.SEED_KIOSK_PASSWORD
  ? 'explicit'
  : kioskExisting
    ? 'kept from .env'
    : 'generated';

await setKioskPassword(gma.id, kioskPassword);
upsertEnv('TEST_KIOSK_PASSWORD', kioskPassword);
console.log(`✓ ${'Kiosk gate password (GMA)'.padEnd(28)} ${''.padEnd(20)} (${kioskSource})`);
if (kioskSource === 'generated') generated.push({ email: 'kiosk gate', password: kioskPassword });

console.log('\nPasswords saved to .env — `npm test` will pick them up automatically.');

if (generated.length) {
  console.log('\nNewly generated (also in .env):');
  for (const { email, password } of generated) console.log(`  ${email.padEnd(20)} ${password}`);
}
