// Dev-only fixtures used by the test suite: two customers, a rider at GMA
// Terminal, and an Imus admin, cashier and rider, so row level security and
// branch isolation can be tested with more than one principal per role.
//
//   node --env-file=.env scripts/dev/seed-test-users.mjs
//
// Safe to re-run: existing accounts have their role and password reset to the
// values below, so a re-seed is always a reliable fix for a failing login.
import { supabaseAdmin } from '../../src/config/supabase.js';
import { setStaffBranches } from '../../src/services/branch.service.js';
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

const ensureStaff = async ({ email, role, fullName, phone, branch }) => {
  const profile = await createStaffUser({ email, password: TEST_USER_PASSWORD, role, fullName, phone });
  await supabaseAdmin.auth.admin.updateUserById(profile.id, { password: TEST_USER_PASSWORD });
  await setStaffBranches(profile.id, [await branchId(branch)]);
  console.log(`✓ ${role.padEnd(8)} ${email.padEnd(22)} branch=${branch}`);
};

await ensureStaff({ email: 'rider1@3k.local', role: 'rider', fullName: 'Pedro Rider', phone: '09181234567', branch: 'gma' });
await ensureStaff({ email: 'rider.imus@3k.local', role: 'rider', fullName: 'Imus Rider', phone: '09181234568', branch: 'imus' });
await ensureStaff({ email: 'admin.imus@3k.local', role: 'admin', fullName: 'Imus Admin', branch: 'imus' });
await ensureStaff({ email: 'cashier.imus@3k.local', role: 'cashier', fullName: 'Imus Cashier', branch: 'imus' });

console.log(`\nAll test users use the password: ${TEST_USER_PASSWORD}`);
