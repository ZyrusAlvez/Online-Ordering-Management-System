// Dev-only fixtures: two customers, riders at GMA Terminal and Imus, and for
// EVERY branch an admin, a cashier login and a kiosk password, plus one area
// admin over several branches. The test suite relies on the customers, riders
// and the Imus accounts; the rest are for trying the app by hand. The full list
// is in docs/test-accounts.md.
//
// GMA Terminal's cashier and kiosk passwords are not set here: they belong to
// scripts/seed-accounts.mjs, which also writes them to .env for `npm test`.
//
//   node --env-file=.env scripts/dev/seed-test-users.mjs
//
// Safe to re-run: existing accounts have their role and password reset to the
// values below, so a re-seed is always a reliable fix for a failing login.
import { supabaseAdmin } from '../../src/config/supabase.js';
import { setStaffBranches } from '../../src/services/branch.service.js';
import { setCashierPassword, setKioskPassword } from '../../src/services/employee.service.js';
import { createStaffUser, setUserRole } from '../../src/services/profile.service.js';

export const TEST_USER_PASSWORD = 'testpass12345';

const findUserId = async (email) => {
  const { data } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  return data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
};

const ensureCustomer = async (email, fullName) => {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: TEST_USER_PASSWORD,
    email_confirm: true,
    app_metadata: { role: 'customer' },
    user_metadata: { full_name: fullName },
  });

  if (error && !/already|registered|exists/i.test(error.message)) throw error;

  const id = data?.user?.id ?? (await findUserId(email));
  await supabaseAdmin.auth.admin.updateUserById(id, { password: TEST_USER_PASSWORD });
  await setUserRole(id, 'customer');

  console.log(`✓ customer ${email.padEnd(22)} ${error ? '(existed, reset)' : '(created)'}`);
};

await ensureCustomer('customer@3k.local', 'Juan Dela Cruz');
await ensureCustomer('customer2@3k.local', 'Maria Santos');

const branchId = async (code) => {
  const { data, error } = await supabaseAdmin.from('branches').select('id').eq('code', code).single();
  if (error) throw new Error(`Branch ${code} not found — apply the migrations first`);
  return data.id;
};

const ensureStaff = async ({ email, role, fullName, phone, branch, branches = [branch] }) => {
  const profile = await createStaffUser({ email, password: TEST_USER_PASSWORD, role, fullName, phone });
  await supabaseAdmin.auth.admin.updateUserById(profile.id, { password: TEST_USER_PASSWORD });
  await setStaffBranches(profile.id, await Promise.all(branches.map(branchId)));
  console.log(`✓ ${role.padEnd(8)} ${email.padEnd(26)} branch=${branches.join(',')}`);
};

await ensureStaff({ email: 'rider1@3k.local', role: 'rider', fullName: 'Pedro Rider', phone: '09181234567', branch: 'gma' });
await ensureStaff({ email: 'rider.imus@3k.local', role: 'rider', fullName: 'Imus Rider', phone: '09181234568', branch: 'imus' });
await ensureStaff({ email: 'cashier.imus@3k.local', role: 'cashier', fullName: 'Imus Cashier', branch: 'imus' });

// Every branch: its own admin, cashier gate and kiosk gate.
const BRANCHES = [
  { code: 'gma', name: 'GMA Terminal' },
  { code: 'dasma', name: 'Dasma Bayan' },
  { code: 'langkaan', name: 'Langkaan' },
  { code: 'gentri', name: 'Gen-Tri' },
  { code: 'trece', name: 'Trece' },
  { code: 'silang', name: 'Silang' },
  { code: 'imus', name: 'Imus' },
];

for (const { code, name } of BRANCHES) {
  await ensureStaff({ email: `admin.${code}@3k.local`, role: 'admin', fullName: `${name} Admin`, branch: code });

  // GMA's gates are seed-accounts.mjs's; Imus's cashier is the account above.
  if (code === 'gma') continue;
  const id = await branchId(code);
  if (code !== 'imus') {
    await setCashierPassword(id, `cashier-${code}`);
    console.log(`✓ cashier  ${`cashier.${code}@3k.local`.padEnd(26)} gate password cashier-${code}`);
  }
  await setKioskPassword(id, `kiosk-${code}`);
  console.log(`✓ kiosk    ${name.padEnd(26)} gate password kiosk-${code}`);
}

// An admin over several branches: the branch switcher offers exactly these three.
await ensureStaff({
  email: 'admin.area@3k.local',
  role: 'admin',
  fullName: 'Dasma Area Admin',
  branches: ['dasma', 'langkaan', 'gentri'],
});

console.log(`\nAll test user accounts use the password: ${TEST_USER_PASSWORD}`);
