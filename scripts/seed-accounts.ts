// Creates the two staff accounts the system needs: the super admin and the GMA Terminal branch's
// shared cashier login, plus GMA's kiosk gate password. Passwords are written to .env.local so the
// flow checks work with no further setup. Other branches get their cashier account the first time
// an admin sets its password. Branches come from the migrations.
//
//   npm run seed:accounts
//
// Safe to re-run. Password precedence: SEED_* (explicit), then TEST_* already in .env.local,
// then a newly generated one. Whichever wins is applied to the account AND written to .env.local.

import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from '@/utils/supabaseAdmin';
import { createStaffUser, setKioskPassword, setStaffBranches } from '@/controllers/server/accounts';
import { upsertEnv } from './lib/env';

const generatePassword = () => randomBytes(12).toString('base64url');

const { data: gma, error: branchError } = await supabaseAdmin.from('branches').select('id, name').eq('code', 'gma').single();
if (branchError) throw new Error(`GMA Terminal branch not found; apply the migrations first (${branchError.message})`);

const accounts = [
  {
    label: 'Super admin',
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@3k.local',
    role: 'super_admin',
    fullName: 'System Administrator',
    envKey: 'TEST_ADMIN_PASSWORD',
    explicit: process.env.SEED_ADMIN_PASSWORD,
    branchId: null as string | null,
  },
  {
    label: 'Cashier (GMA shared login)',
    email: process.env.SEED_CASHIER_EMAIL ?? 'cashier@3k.local',
    role: 'cashier',
    fullName: 'GMA Terminal Cashier',
    envKey: 'TEST_CASHIER_PASSWORD',
    explicit: process.env.SEED_CASHIER_PASSWORD,
    branchId: gma.id as string,
  },
];

const generated: { email: string; password: string }[] = [];

for (const account of accounts) {
  const existing = process.env[account.envKey];
  const password = account.explicit || existing || generatePassword();
  const source = account.explicit ? 'explicit' : existing ? 'kept from .env.local' : 'generated';

  const created = await createStaffUser({ email: account.email, password, role: account.role, fullName: account.fullName });
  if (created.success === false) throw new Error(`${account.email}: ${created.error}`);

  // createStaffUser leaves an existing account's password alone; setting it here keeps .env.local honest.
  const { error } = await supabaseAdmin.auth.admin.updateUserById(created.data.id, { password });
  if (error) throw new Error(`Could not set password for ${account.email}: ${error.message}`);
  if (account.branchId) await setStaffBranches(created.data.id, [account.branchId]);

  upsertEnv(account.envKey, password);
  console.log(`✓ ${account.label.padEnd(28)} ${account.email.padEnd(20)} role=${account.role}  (${source})`);
  if (source === 'generated') generated.push({ email: account.email, password });
}

// The kiosk gate password lives in employee_credentials, not in Supabase Auth.
const kioskExisting = process.env.TEST_KIOSK_PASSWORD;
const kioskPassword = process.env.SEED_KIOSK_PASSWORD || kioskExisting || generatePassword();
const kioskSource = process.env.SEED_KIOSK_PASSWORD ? 'explicit' : kioskExisting ? 'kept from .env.local' : 'generated';
const kiosk = await setKioskPassword(gma.id, kioskPassword);
if (kiosk.success === false) throw new Error(`Kiosk password: ${kiosk.error}`);
upsertEnv('TEST_KIOSK_PASSWORD', kioskPassword);
console.log(`✓ ${'Kiosk gate password (GMA)'.padEnd(28)} ${''.padEnd(20)} (${kioskSource})`);
if (kioskSource === 'generated') generated.push({ email: 'kiosk gate', password: kioskPassword });

console.log('\nPasswords saved to .env.local.');
if (generated.length) {
  console.log('\nNewly generated (also in .env.local):');
  for (const { email, password } of generated) console.log(`  ${email.padEnd(20)} ${password}`);
}
