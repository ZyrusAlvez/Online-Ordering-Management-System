import { env } from '../config/env.js';
import { createAnonClient, supabaseAdmin } from '../config/supabase.js';
import { ApiError, fromPostgrestError } from '../utils/ApiError.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { getBranchOrFail, setStaffBranches, staffOfBranch } from './branch.service.js';
import { issueKioskDevice } from './kioskDevice.service.js';
import { createStaffUser } from './profile.service.js';

const CREDENTIALS_TABLE = 'employee_credentials';

const WRONG_PASSWORD = () => ApiError.unauthorized('Incorrect employee password');

/** The branch's cashier login: `cashier.<code>@<domain of CASHIER_EMAIL>`, e.g. cashier.imus@3k.local. */
const cashierEmailFor = (branch) => `cashier.${branch.code}@${env.CASHIER_EMAIL.split('@')[1]}`;

/**
 * Cashier gate. Each branch has its own shared cashier account, and the
 * employee password IS that account's Supabase password, so a successful check
 * yields a normal session scoped to the branch and every /pos route keeps working.
 */
export const loginCashier = async ({ branchId, password }) => {
  const cashierId = await staffOfBranch(branchId, 'cashier');
  // Same answer for "no cashier set up" as for a wrong password.
  if (!cashierId) throw WRONG_PASSWORD();

  const { data: found, error: lookupError } = await supabaseAdmin.auth.admin.getUserById(cashierId);
  if (lookupError || !found?.user?.email) throw WRONG_PASSWORD();

  const { data, error } = await createAnonClient().auth.signInWithPassword({
    email: found.user.email,
    password,
  });
  if (error) throw WRONG_PASSWORD();

  return { user: data.user, session: data.session };
};

/**
 * Sets a branch's cashier password. The first time, this also creates the
 * branch's shared cashier account.
 */
export const setCashierPassword = async (branchId, password) => {
  const cashierId = await staffOfBranch(branchId, 'cashier');

  if (cashierId) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(cashierId, { password });
    if (error) throw new ApiError(error.status ?? 400, error.message);
    return;
  }

  const branch = await getBranchOrFail(branchId);
  const email = cashierEmailFor(branch);
  const profile = await createStaffUser({ email, password, role: 'cashier', fullName: `${branch.name} Cashier` });

  // createStaffUser leaves an existing account's password alone.
  const { error } = await supabaseAdmin.auth.admin.updateUserById(profile.id, { password });
  if (error) throw new ApiError(error.status ?? 400, error.message);

  await setStaffBranches(profile.id, [branchId]);
};

/**
 * Kiosk gate. A correct password for the branch provisions a fresh device key
 * bound to that branch, so the existing requireKiosk middleware and per-device
 * revocation keep working. The password is then only needed once per browser.
 */
export const unlockKiosk = async ({ branchId, password, deviceName }) => {
  const { data, error } = await supabaseAdmin
    .from(CREDENTIALS_TABLE)
    .select('password_hash')
    .eq('role', 'kiosk')
    .eq('branch_id', branchId)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);

  // Same message whether the password is unset or wrong, so the response does
  // not reveal whether a kiosk password has been configured.
  if (!data || !(await verifyPassword(password, data.password_hash))) throw WRONG_PASSWORD();

  return issueKioskDevice(deviceName, branchId);
};

export const setKioskPassword = async (branchId, password, adminId) => {
  const { error } = await supabaseAdmin.from(CREDENTIALS_TABLE).upsert(
    {
      role: 'kiosk',
      branch_id: branchId,
      password_hash: await hashPassword(password),
      updated_at: new Date().toISOString(),
      updated_by: adminId ?? null,
    },
    { onConflict: 'role,branch_id' },
  );
  if (error) throw fromPostgrestError(error);
};
