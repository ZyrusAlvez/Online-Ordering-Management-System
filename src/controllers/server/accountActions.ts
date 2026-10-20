'use server';

import * as accountModel from '@/models/server/accountModel';
import { RULES, clientIp, limit } from '@/controllers/server/rateLimit';
import { verifyCaller } from '@/controllers/server/serverCaller';
import { validate } from '@/utils/validate';
import { changePasswordSchema, forgotPasswordSchema } from '@/utils/validators/auth.validators';
import { emailRefused } from '@/utils/emailRefused';
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

/**
 * Forgot password: emails a 6-digit reset code, after checking the address has an account that
 * can have one. Saying "no account" tells a visitor which emails are registered, so lookups are
 * limited per visitor, and each address gets at most one code every RESEND_SECONDS.
 */
export async function sendPasswordResetCode(input: unknown) {
  const allowed = await limit(RULES.passwordResetLookup, await clientIp());
  if (allowed.success === false) return allowed;
  const body = validate(forgotPasswordSchema, input);
  if (body.success === false) return body;
  const { email } = body.data;

  const { data: account, error: lookupError } = await accountModel.passwordResetTarget(email);
  if (lookupError) return fail('Could not check that email. Please try again.', 500);
  if (!account) return fail('No account uses this email. Check it, or create an account.', 404);
  if (account.role === 'cashier') return fail('The cashier password is changed by an admin', 403);
  if (!account.is_active) return fail('This account is turned off. Ask the restaurant for help.', 403);
  if (!account.has_password) return fail('This email signs in with Google. Use Continue with Google to log in.');

  const once = await limit(RULES.passwordResetEmail, email);
  if (once.success === false) return once;
  const { error } = await accountModel.sendRecoveryEmail(email);
  if (error) return emailRefused(error) ?? fail('Could not send the email. Please try again.', 500);
  return ok(null);
}
