// Dev-only fixtures: two customers, riders at GMA Terminal and Imus, and for EVERY branch an admin,
// a cashier login and a kiosk password, plus one area admin over several branches. The full list is
// in docs/test-accounts.md. GMA's cashier and kiosk passwords belong to seed-accounts.ts.
//
//   npm run seed:test-users
//
// Safe to re-run: existing accounts get their role and password reset, so a re-seed always fixes
// a failing test login.

import { supabaseAdmin } from '@/utils/supabaseAdmin';
import {
  createStaffUser,
  findUserByEmail,
  setCashierPassword,
  setKioskPassword,
  setStaffBranches,
  setUserRole,
} from '@/controllers/server/accounts';

const TEST_USER_PASSWORD = 'testpass12345';

const ensureCustomer = async (email: string, fullName: string) => {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: TEST_USER_PASSWORD,
    email_confirm: true,
    app_metadata: { role: 'customer' },
    user_metadata: { full_name: fullName },
  });
  if (error && !/already|registered|exists/i.test(error.message)) throw error;
  const id = data?.user?.id ?? (await findUserByEmail(email))?.id;
  if (!id) throw new Error(`Could not find ${email}`);
  await supabaseAdmin.auth.admin.updateUserById(id, { password: TEST_USER_PASSWORD });
  await setUserRole(id, 'customer');
  console.log(`✓ customer ${email.padEnd(22)} ${error ? '(existed, reset)' : '(created)'}`);
};

const branchId = async (code: string) => {
  const { data, error } = await supabaseAdmin.from('branches').select('id').eq('code', code).single();
  if (error) throw new Error(`Branch ${code} not found; apply the migrations first`);
  return data.id as string;
};

const ensureStaff = async ({
  email,
  role,
  fullName,
  phone,
  branches,
}: { email: string; role: string; fullName: string; phone?: string; branches: string[] }) => {
  const created = await createStaffUser({ email, password: TEST_USER_PASSWORD, role, fullName, phone });
  if (created.success === false) throw new Error(`${email}: ${created.error}`);
  await supabaseAdmin.auth.admin.updateUserById(created.data.id, { password: TEST_USER_PASSWORD });
  await setStaffBranches(created.data.id, await Promise.all(branches.map(branchId)));
  console.log(`✓ ${role.padEnd(8)} ${email.padEnd(26)} branch=${branches.join(',')}`);
};

await ensureCustomer('customer@3k.local', 'Juan Dela Cruz');
await ensureCustomer('customer2@3k.local', 'Maria Santos');

await ensureStaff({ email: 'rider1@3k.local', role: 'rider', fullName: 'Pedro Rider', phone: '09181234567', branches: ['gma'] });
await ensureStaff({ email: 'rider.imus@3k.local', role: 'rider', fullName: 'Imus Rider', phone: '09181234568', branches: ['imus'] });
await ensureStaff({ email: 'cashier.imus@3k.local', role: 'cashier', fullName: 'Imus Cashier', branches: ['imus'] });

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
  await ensureStaff({ email: `admin.${code}@3k.local`, role: 'admin', fullName: `${name} Admin`, branches: [code] });

  // GMA's gates are seed-accounts.ts's; Imus's cashier is the account above.
  if (code === 'gma') continue;
  const id = await branchId(code);
  if (code !== 'imus') {
    const cashier = await setCashierPassword(id, `cashier-${code}`);
    if (cashier.success === false) throw new Error(`cashier ${code}: ${cashier.error}`);
    console.log(`✓ cashier  ${`cashier.${code}@3k.local`.padEnd(26)} gate password cashier-${code}`);
  }
  const kiosk = await setKioskPassword(id, `kiosk-${code}`);
  if (kiosk.success === false) throw new Error(`kiosk ${code}: ${kiosk.error}`);
  console.log(`✓ kiosk    ${name.padEnd(26)} gate password kiosk-${code}`);
}

// An admin over several branches: the branch switcher offers exactly these three.
await ensureStaff({ email: 'admin.area@3k.local', role: 'admin', fullName: 'Dasma Area Admin', branches: ['dasma', 'langkaan', 'gentri'] });

console.log(`\nAll test user accounts use the password: ${TEST_USER_PASSWORD}`);
