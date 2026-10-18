'use server';

import * as accountModel from '@/models/server/accountModel';
import * as kioskModel from '@/models/server/kioskModel';
import * as adminModel from '@/models/server/adminModel';
import { issueKioskDevice } from '@/controllers/server/kioskDevices';
import { verifyPassword } from '@/utils/server/password';
import { validate } from '@/utils/validate';
import { employeeLoginSchema, kioskUnlockSchema } from '@/utils/validators/employee.validators';
import { fail, ok } from '@/utils/result';

// The cashier and kiosk password gates. Same answer for "not set up" as for a wrong password,
// so the response never reveals whether a branch has one configured.
const WRONG_PASSWORD = () => fail('Incorrect employee password', 401);

/**
 * Cashier gate. Each branch has its own shared cashier account and the employee password is that
 * account's Supabase password, so a correct one yields a normal session (handed to the browser).
 */
export async function loginCashier(input: unknown) {
  const body = validate(employeeLoginSchema, input);
  if (body.success === false) return body;

  const { data: row } = await accountModel.getBranchCashierId(body.data.branch_id);
  if (!row?.profile_id) return WRONG_PASSWORD();
  const { data: found } = await accountModel.getUserById(row.profile_id);
  if (!found?.user?.email) return WRONG_PASSWORD();

  const { data, error } = await accountModel.signInFresh(found.user.email, body.data.password);
  if (error || !data.session) return WRONG_PASSWORD();
  return ok({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
}

/**
 * Kiosk gate. A correct password for the branch provisions a fresh device key bound to it, so
 * the password is only typed once per kiosk browser and each device can be revoked on its own.
 */
export async function unlockKiosk(input: unknown) {
  const body = validate(kioskUnlockSchema, input);
  if (body.success === false) return body;

  const { data } = await kioskModel.getKioskPasswordHash(body.data.branch_id);
  if (!data || !(await verifyPassword(body.data.password, data.password_hash))) return WRONG_PASSWORD();

  const { data: branch } = await adminModel.getBranch(body.data.branch_id);
  const issued = await issueKioskDevice(body.data.device_name, body.data.branch_id);
  if (issued.success === false) return issued;
  return ok({ id: issued.data.id, name: issued.data.name, key: issued.data.key, branch });
}
