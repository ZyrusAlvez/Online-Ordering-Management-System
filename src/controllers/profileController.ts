import type { User } from '@supabase/supabase-js';
import * as profileModel from '@/models/profileModel';
import * as branchModel from '@/models/branchModel';
import { getCaller } from '@/controllers/callerController';
import { shapeBranch, type Branch } from '@/controllers/branchController';
import { validate } from '@/utils/validate';
import { updateProfileSchema } from '@/utils/validators/auth.validators';
import { fail, fromDbError, ok, type Result } from '@/utils/result';
import { cached, invalidate } from '@/utils/cache';

export type Profile = {
  id: string;
  email: string | undefined;
  full_name: string | null;
  phone: string | null;
  default_address: Record<string, any> | null;
  role: string;
  sign_in_method: 'email' | 'google';
  can_change_password: boolean;
  avatar_url: string | null;
  branches: Branch[];
};

/** Accounts made through Google have no email/password identity, so no password to change. */
const hasPassword = (user: User) => (user.identities ?? []).some((i) => i.provider === 'email');

const shape = (user: User, row: any, branches: Branch[]): Profile => ({
  id: user.id,
  email: user.email,
  full_name: row?.full_name ?? null,
  phone: row?.phone ?? null,
  default_address: row?.default_address ?? null,
  role: (user.app_metadata?.role as string) ?? 'customer',
  sign_in_method: hasPassword(user) ? 'email' : 'google',
  can_change_password: hasPassword(user),
  avatar_url: user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null,
  branches,
});

/** The signed-in account, plus the branches it works at (every branch for a super admin). */
export const getMyProfile = async (): Promise<Result<Profile>> => {
  const caller = await getCaller();
  if (caller.success === false) return caller;
  // Several screens ask at once (the staff branch picker, checkout): memory only, per user.
  return cached(`profile:${caller.data.user.id}`, { ttlMs: 30_000, kind: 'private' }, () => loadProfile(caller.data));
};

const loadProfile = async ({ user, branchIds }: { user: User; branchIds: string[] | null }): Promise<Result<Profile>> => {

  const [{ data: row, error }, branchRows] = await Promise.all([
    profileModel.getOwnProfile(user.id),
    branchIds === null
      ? branchModel.getAllBranches()
      : branchIds.length
        ? branchModel.getBranchesByIds(branchIds)
        : Promise.resolve({ data: [] as any[] }),
  ]);
  if (error) return fromDbError(error, 'Failed to load your profile');
  return ok(shape(user, row, ((branchRows as any).data ?? []).map(shapeBranch)));
};

/** Edits the caller's own name, phone and saved address (role and is_active are not editable). */
export const updateMyProfile = async (input: unknown): Promise<Result<Profile>> => {
  const caller = await getCaller();
  if (caller.success === false) return caller;
  const body = validate(updateProfileSchema, input);
  if (body.success === false) return body;
  const user = caller.data.user;

  const { data, error } = await profileModel.updateOwnProfile(user.id, body.data);
  if (error) return fromDbError(error, 'Failed to save your profile');
  if (!data) return fail('Profile not found', 404);
  invalidate(`profile:${user.id}`);

  // Merge rather than replace: Google stores the avatar in user_metadata too.
  let updated = user;
  if (body.data.full_name) {
    const { data: meta, error: metaError } = await profileModel.updateUserMetadata({
      ...user.user_metadata,
      full_name: body.data.full_name,
    });
    if (metaError) return fail(metaError.message, 500);
    updated = meta.user ?? user;
  }
  const current = await getMyProfile();
  return current.success ? current : ok(shape(updated, data, []));
};
