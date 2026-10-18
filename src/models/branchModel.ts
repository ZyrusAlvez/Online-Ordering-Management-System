import { supabase } from '@/utils/supabase';

export type BranchRow = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  latitude: number | string;
  longitude: number | string;
  opens_at: string | null;
  closes_at: string | null;
  is_active: boolean;
};

export const BRANCH_COLUMNS = 'id, code, name, address, phone, latitude, longitude, opens_at, closes_at, is_active';

export const getActiveBranches = () =>
  supabase.from('branches').select(BRANCH_COLUMNS).eq('is_active', true).order('name');

/** Every branch, inactive included (a super admin may read them all). */
export const getAllBranches = () => supabase.from('branches').select(BRANCH_COLUMNS).order('name');

export const getBranchesByIds = (ids: string[]) =>
  supabase.from('branches').select(BRANCH_COLUMNS).in('id', ids).order('name');

export const getBranchById = (id: string) =>
  supabase.from('branches').select(BRANCH_COLUMNS).eq('id', id).maybeSingle();

export const insertBranch = (fields: Partial<BranchRow>) =>
  supabase.from('branches').insert(fields).select(BRANCH_COLUMNS).single();

export const updateBranch = (id: string, fields: Partial<BranchRow>) =>
  supabase
    .from('branches')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(BRANCH_COLUMNS)
    .maybeSingle();

export const getSoldOut = (branchId: string) =>
  supabase.from('branch_unavailable_products').select('product_id').eq('branch_id', branchId);

export const insertSoldOut = (branchId: string, productId: string) =>
  supabase
    .from('branch_unavailable_products')
    .upsert({ branch_id: branchId, product_id: productId }, { onConflict: 'branch_id,product_id', ignoreDuplicates: true });

export const deleteSoldOut = (branchId: string, productId: string) =>
  supabase.from('branch_unavailable_products').delete().eq('branch_id', branchId).eq('product_id', productId);

export const getMyBranchIds = (profileId: string) =>
  supabase.from('branch_staff').select('branch_id').eq('profile_id', profileId);
