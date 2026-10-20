import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/utils/supabaseAdmin';

/** A throwaway publishable-key client, for checking a password without touching any session. */
export const signInFresh = (email: string, password: string) =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '', {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.signInWithPassword({ email, password });

/** Who an email belongs to, for Forgot password (see migration password_reset_lookup). */
export const passwordResetTarget = (email: string) =>
  supabaseAdmin.rpc('password_reset_target', { p_email: email }).maybeSingle<{
    id: string;
    role: string;
    is_active: boolean;
    has_password: boolean;
  }>();

/** Emails the reset-password template (a 6-digit code). */
export const sendRecoveryEmail = (email: string) => supabaseAdmin.auth.resetPasswordForEmail(email);

export const getUserById = (id: string) => supabaseAdmin.auth.admin.getUserById(id);

export const createUser = (fields: Parameters<typeof supabaseAdmin.auth.admin.createUser>[0]) =>
  supabaseAdmin.auth.admin.createUser(fields);

export const updateUser = (id: string, fields: Parameters<typeof supabaseAdmin.auth.admin.updateUserById>[1]) =>
  supabaseAdmin.auth.admin.updateUserById(id, fields);

export const listUsers = (page: number, perPage: number) => supabaseAdmin.auth.admin.listUsers({ page, perPage });

export const updateProfile = (id: string, fields: Record<string, unknown>) =>
  supabaseAdmin.from('profiles').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id).select().maybeSingle();

const WITH_BRANCHES = 'branch_staff(branch:branches(id, code, name))';

export const getStaffProfile = (id: string, roles: string[]) =>
  supabaseAdmin.from('profiles').select(`*, ${WITH_BRANCHES}`).eq('id', id).in('role', roles).maybeSingle();

export const listProfiles = (roles: string[], branchIds: string[] | null, page: number, limit: number) => {
  const from = (page - 1) * limit;
  let query = supabaseAdmin
    .from('profiles')
    .select(branchIds ? `*, scope:branch_staff!inner(branch_id), ${WITH_BRANCHES}` : `*, ${WITH_BRANCHES}`, { count: 'exact' })
    .in('role', roles)
    .order('created_at', { ascending: false })
    .order('id')
    .range(from, from + limit - 1);
  if (branchIds) query = query.in('scope.branch_id', branchIds);
  return query;
};

export const upsertStaffBranches = (profileId: string, branchIds: string[]) =>
  supabaseAdmin
    .from('branch_staff')
    .upsert(branchIds.map((b) => ({ profile_id: profileId, branch_id: b })), { onConflict: 'profile_id,branch_id', ignoreDuplicates: true });

export const deleteStaffBranchesExcept = (profileId: string, keep: string[]) => {
  let query = supabaseAdmin.from('branch_staff').delete().eq('profile_id', profileId);
  if (keep.length) query = query.not('branch_id', 'in', `(${keep.join(',')})`);
  return query;
};

/** The branch's shared cashier account, if one exists. */
export const getBranchCashierId = (branchId: string) =>
  supabaseAdmin
    .from('branch_staff')
    .select('profile_id, profile:profiles!inner(id, role)')
    .eq('branch_id', branchId)
    .eq('profile.role', 'cashier')
    .limit(1)
    .maybeSingle();

export const salesReport = (from: string, to: string, branchIds: string[] | null) =>
  supabaseAdmin.rpc('sales_report', { p_from: from, p_to: to, p_branch_ids: branchIds });
