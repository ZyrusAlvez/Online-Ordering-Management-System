import 'server-only';
import * as accountModel from '@/models/server/accountModel';
import * as kioskModel from '@/models/server/kioskModel';
import * as adminModel from '@/models/server/adminModel';
import { hashPassword } from '@/utils/server/password';
import { ROLES } from '@/constants/orders';
import { fail, fromDbError, ok, type Result } from '@/utils/result';

// Account helpers shared by the server actions. Not 'use server': nothing here checks the caller.

/** Supabase has no admin lookup by email, so walk the user pages. */
export const findUserByEmail = async (email: string) => {
  const wanted = email.toLowerCase();
  const perPage = 200;
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await accountModel.listUsers(page, perPage);
    if (error) return null;
    const users = data.users as import("@supabase/supabase-js").User[];
    const hit = users.find((u) => u.email?.toLowerCase() === wanted);
    if (hit) return hit;
    if (users.length < perPage) return null;
  }
  return null;
};

/**
 * A role lives in two places that must agree: app_metadata.role (in the JWT, read by RLS) and
 * profiles.role (queryable, for the admin lists). Every role change goes through here.
 */
export const setUserRole = async (userId: string, role: string) => {
  if (!(ROLES as readonly string[]).includes(role)) return fail(`Unknown role: ${role}`);
  const { error: authError } = await accountModel.updateUser(userId, { app_metadata: { role } });
  if (authError) return fail(authError.message, authError.status ?? 500);
  const { data, error } = await accountModel.updateProfile(userId, { role });
  if (error) return fromDbError(error);
  if (!data) return fail('Profile not found', 404);
  return ok(data);
};

/**
 * Creates a staff account (cashier, rider, admin) with a pre-confirmed email. Idempotent on
 * email: an existing user gets its role corrected instead of an error.
 */
export const createStaffUser = async ({
  email,
  password,
  role,
  fullName,
  phone,
}: {
  email: string;
  password: string;
  role: string;
  fullName?: string | null;
  phone?: string | null;
}): Promise<Result<{ id: string }>> => {
  const { data: created, error } = await accountModel.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { full_name: fullName ?? null },
  });

  let userId = created?.user?.id;
  if (error) {
    if (!/already|registered|exists/i.test(error.message)) return fail(error.message, error.status ?? 400);
    const existing = await findUserByEmail(email);
    if (!existing) return fail(error.message, error.status ?? 400);
    // Never quietly demote a super admin by "creating" a staff account on their email.
    if (existing.app_metadata?.role === 'super_admin' && role !== 'super_admin') {
      return fail('That email belongs to a super admin', 409);
    }
    userId = existing.id;
  }

  // The on_auth_user_created trigger has already inserted the profile row.
  if (phone || fullName) {
    const { error: profileError } = await accountModel.updateProfile(userId!, {
      ...(phone ? { phone } : {}),
      ...(fullName ? { full_name: fullName } : {}),
    });
    if (profileError) return fromDbError(profileError);
  }
  const roleSet = await setUserRole(userId!, role);
  if (roleSet.success === false) return roleSet;
  return ok({ id: userId! });
};

/** Replaces a staff account's branches. New rows first, so a failure never leaves none. */
export const setStaffBranches = async (profileId: string, branchIds: string[]) => {
  const wanted = [...new Set(branchIds)];
  const { error } = await accountModel.upsertStaffBranches(profileId, wanted);
  if (error) return fromDbError(error);
  const { error: deleteError } = await accountModel.deleteStaffBranchesExcept(profileId, wanted);
  if (deleteError) return fromDbError(deleteError);
  return ok(null);
};

/** A staff profile with its branches as a plain list. */
export const getStaffProfile = async (id: string, roles: string[]) => {
  const { data } = await accountModel.getStaffProfile(id, roles);
  if (!data) return null;
  const { branch_staff: staff, scope: _scope, ...profile } = data as any;
  return { ...profile, branches: (staff ?? []).map((r: any) => r.branch).filter(Boolean) };
};

// Each branch's cashier gate signs in to a real Supabase account (so the register works under the
// database rules as that branch's staff), and Supabase logins need an email. Nobody types it: the
// gate finds it from the branch (branch_staff), so the email itself is never looked up.
const cashierEmailFor = (code: string) => `cashier.${code}@3k.local`;

/**
 * Sets a branch's cashier gate password: the password of its shared cashier account. The first
 * time, this also creates that account (cashier.<code>@3k.local).
 */
export const setCashierPassword = async (branchId: string, password: string): Promise<Result<null>> => {
  const { data: row } = await accountModel.getBranchCashierId(branchId);
  if (row?.profile_id) {
    const { error } = await accountModel.updateUser(row.profile_id, { password });
    return error ? fail(error.message, error.status ?? 400) : ok(null);
  }

  const { data: branch } = await adminModel.getBranch(branchId);
  if (!branch) return fail('Branch not found', 404);
  const created = await createStaffUser({ email: cashierEmailFor(branch.code), password, role: 'cashier', fullName: `${branch.name} Cashier` });
  if (created.success === false) return created;
  // createStaffUser leaves an existing account's password alone.
  const { error } = await accountModel.updateUser(created.data.id, { password });
  if (error) return fail(error.message, error.status ?? 400);
  return setStaffBranches(created.data.id, [branchId]);
};

/** Sets a branch's kiosk gate password (a scrypt hash in employee_credentials). */
export const setKioskPassword = async (branchId: string, password: string, updatedBy: string | null = null): Promise<Result<null>> => {
  const { error } = await kioskModel.upsertKioskPassword(branchId, await hashPassword(password), updatedBy);
  return error ? fromDbError(error) : ok(null);
};
