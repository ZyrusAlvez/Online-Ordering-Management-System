import 'server-only';
import { supabaseAdmin } from '@/utils/supabaseAdmin';

// Queries that need the secret key: rows with no browser policy (kiosk keys, chat secrets,
// employee passwords) and Supabase Auth admin calls. Only server actions import this.

export const getUserFromToken = (accessToken: string) => supabaseAdmin.auth.getUser(accessToken);

export const getProfileFlags = (id: string) =>
  supabaseAdmin.from('profiles').select('role, is_active').eq('id', id).maybeSingle();

export const getBranchIdsOf = (profileId: string) =>
  supabaseAdmin.from('branch_staff').select('branch_id').eq('profile_id', profileId);

export const getBranch = (id: string) =>
  supabaseAdmin
    .from('branches')
    .select('id, code, name, address, phone, latitude, longitude, opens_at, closes_at, is_active')
    .eq('id', id)
    .maybeSingle();

export const listBranchesByIds = (ids: string[] | null) => {
  let query = supabaseAdmin.from('branches').select('id, code, name, is_active').order('name');
  if (ids) query = query.in('id', ids);
  return query;
};
