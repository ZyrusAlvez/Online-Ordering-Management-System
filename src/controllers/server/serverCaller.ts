import 'server-only';
import type { User } from '@supabase/supabase-js';
import * as adminModel from '@/models/server/adminModel';
import type { Role } from '@/controllers/authController';
import { fail, ok, type Result } from '@/utils/result';

export type ServerCaller = { user: User; role: Role; branchIds: string[] | null };

/**
 * Server-side twin of getCaller: the browser passes its access token, which is verified with
 * Supabase Auth (it cannot be forged), then role, is_active and branch scope are read with the
 * secret key, exactly like the old requireAuth + requireActive + loadBranchScope middleware.
 */
export const verifyCaller = async (accessToken: string | null | undefined, roles?: Role[]): Promise<Result<ServerCaller>> => {
  if (!accessToken) return fail('Please log in again', 401);
  const { data, error } = await adminModel.getUserFromToken(accessToken);
  if (error || !data.user) return fail('Please log in again', 401);

  const user = data.user;
  const role = ((user.app_metadata?.role as Role | undefined) ?? 'customer') as Role;
  if (roles && !roles.includes(role)) return fail('You are not allowed to do that', 403);

  const { data: profile } = await adminModel.getProfileFlags(user.id);
  if (profile && profile.is_active === false) return fail('This account has been deactivated', 403);

  if (role === 'super_admin') return ok({ user, role, branchIds: null });
  if (role === 'customer') return ok({ user, role, branchIds: [] });
  const { data: rows } = await adminModel.getBranchIdsOf(user.id);
  return ok({ user, role, branchIds: (rows ?? []).map((r) => r.branch_id as string) });
};

export const callerCanAccess = (caller: ServerCaller, branchId: string | null | undefined) =>
  Boolean(branchId) && (caller.branchIds === null || caller.branchIds.includes(branchId as string));

/** The branches a list should cover: one requested branch (if allowed), else the caller's scope. */
export const branchFilter = (caller: ServerCaller, branchId?: string | null): string[] | null => {
  if (branchId) return callerCanAccess(caller, branchId) ? [branchId] : [];
  return caller.branchIds;
};
