// Dev-only fixtures used by the test suite: two customers and a rider, so row
// level security can be tested with more than one principal per role.
//
//   node --env-file=.env scripts/dev/seed-test-users.mjs
//
// Safe to re-run: existing accounts have their role and password reset to the
// values below, so a re-seed is always a reliable fix for a failing login.
import { supabaseAdmin } from '../../src/config/supabase.js';
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

const rider = await createStaffUser({
  email: 'rider1@3k.local',
  password: TEST_USER_PASSWORD,
  role: 'rider',
  fullName: 'Pedro Rider',
  phone: '09181234567',
});
await supabaseAdmin.auth.admin.updateUserById(rider.id, { password: TEST_USER_PASSWORD });
console.log(`✓ rider    ${'rider1@3k.local'.padEnd(22)} role=${rider.role}`);

console.log(`\nAll test users use the password: ${TEST_USER_PASSWORD}`);
