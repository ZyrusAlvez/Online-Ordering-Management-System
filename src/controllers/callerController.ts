import type { User } from '@supabase/supabase-js';
import { supabase } from '@/utils/supabase';
import * as branchModel from '@/models/branchModel';
import { roleOf, type Role } from '@/controllers/authController';
import { fail, ok, type Result } from '@/utils/result';
import { cached } from '@/utils/cache';

/**
 * Who is calling, and where they work: the port of the old requireAuth + loadBranchScope
 * middleware. `branchIds` is null for a super admin (every branch).
 */
export type Caller = { user: User; role: Role; branchIds: string[] | null };

export const getCaller = async (roles?: Role[]): Promise<Result<Caller>> => {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return fail('Please log in again', 401);

  const role = roleOf(session) as Role;
  if (roles && !roles.includes(role)) return fail('You are not allowed to do that', 403);

  if (role === 'customer') return ok({ user: session.user, role, branchIds: [] });
  if (role === 'super_admin') return ok({ user: session.user, role, branchIds: null });

  // Every staff action needs this, so it is remembered for a minute (memory only, per user,
  // dropped at sign-out). The database still checks branch access on every write.
  const branches = await cached(`caller:${session.user.id}`, { ttlMs: 60_000, kind: 'private' }, async () => {
    const { data: rows, error } = await branchModel.getMyBranchIds(session.user.id);
    if (error) return fail('Could not load your branches', 500);
    return ok((rows ?? []).map((r) => r.branch_id as string));
  });
  if (branches.success === false) return branches;
  return ok({ user: session.user, role, branchIds: branches.data });
};

export const canAccessBranch = (caller: Caller, branchId: string | null | undefined) =>
  Boolean(branchId) && (caller.branchIds === null || caller.branchIds.includes(branchId as string));
