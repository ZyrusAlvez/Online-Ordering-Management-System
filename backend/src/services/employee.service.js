import { env } from '../config/env.js';
import { createAnonClient, supabaseAdmin } from '../config/supabase.js';
import { ApiError, fromPostgrestError } from '../utils/ApiError.js';
import { findUserByEmail } from '../utils/findUser.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { issueKioskDevice } from './kioskDevice.service.js';

const CREDENTIALS_TABLE = 'employee_credentials';

/**
 * Cashier gate. The employee password IS the shared cashier account's Supabase
 * password, so a successful check yields a normal session and every /pos route
 * keeps working unchanged.
 */
export const loginCashier = async (password) => {
  const { data, error } = await createAnonClient().auth.signInWithPassword({
    email: env.CASHIER_EMAIL,
    password,
  });
  if (error) throw ApiError.unauthorized('Incorrect employee password');

  return { user: data.user, session: data.session };
};

export const setCashierPassword = async (password) => {
  const cashier = await findUserByEmail(env.CASHIER_EMAIL);
  if (!cashier) throw ApiError.notFound(`Cashier account ${env.CASHIER_EMAIL} does not exist`);

  const { error } = await supabaseAdmin.auth.admin.updateUserById(cashier.id, { password });
  if (error) throw new ApiError(error.status ?? 400, error.message);
};

/**
 * Kiosk gate. A correct password provisions a fresh device key for this
 * browser, so the existing requireKiosk middleware and per-device revocation
 * keep working. The password is then only needed once per browser.
 */
export const unlockKiosk = async ({ password, deviceName }) => {
  const { data, error } = await supabaseAdmin
    .from(CREDENTIALS_TABLE)
    .select('password_hash')
    .eq('role', 'kiosk')
    .maybeSingle();
  if (error) throw fromPostgrestError(error);

  // Same message whether the password is unset or wrong, so the response does
  // not reveal whether a kiosk password has been configured.
  if (!data || !(await verifyPassword(password, data.password_hash))) {
    throw ApiError.unauthorized('Incorrect employee password');
  }

  return issueKioskDevice(deviceName);
};

export const setKioskPassword = async (password, adminId) => {
  const { error } = await supabaseAdmin.from(CREDENTIALS_TABLE).upsert({
    role: 'kiosk',
    password_hash: await hashPassword(password),
    updated_at: new Date().toISOString(),
    updated_by: adminId ?? null,
  });
  if (error) throw fromPostgrestError(error);
};
