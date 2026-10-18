'use server';

import * as accountModel from '@/models/server/accountModel';
import { RULES, limit } from '@/controllers/server/rateLimit';
import { verifyCaller } from '@/controllers/server/serverCaller';
import { validate } from '@/utils/validate';
import { changePasswordSchema } from '@/utils/validators/auth.validators';
import { fail, ok } from '@/utils/result';

/**
 * Changes the caller's own password after re-checking the current one. Google accounts have no
 * password; the shared cashier login is changed by an admin from Settings.
 * Returns 400 (not 401) for a wrong current password: screens treat 401 as "session over".
 */
export async function changeMyPassword(token: string, input: unknown) {
  const caller = await verifyCaller(token);
  if (caller.success === false) return caller;
  const allowed = await limit(RULES.passwordChange, caller.data.user.id);
  if (allowed.success === false) return allowed;
  const body = validate(changePasswordSchema, input);
  if (body.success === false) return body;
  const user = caller.data.user;

  if (!(user.identities ?? []).some((i) => i.provider === 'email')) {
    return fail('This account signs in with Google, so it has no password to change');
  }
  if (caller.data.role === 'cashier') return fail('The cashier password is changed by an admin', 403);

  const { error: verifyError } = await accountModel.signInFresh(user.email!, body.data.current_password);
  if (verifyError) return fail('Current password is incorrect');

  const { error } = await accountModel.updateUser(user.id, { password: body.data.new_password });
  if (error) return fail(error.message, error.status ?? 400);
  return ok(null);
}
