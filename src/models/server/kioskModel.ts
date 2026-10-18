import 'server-only';
import { supabaseAdmin } from '@/utils/supabaseAdmin';
import { WITH_ITEMS } from '@/constants/orders';

/** key_hash is never selected back out, only the prefix that identifies the device. */
export const SAFE_COLUMNS =
  'id, name, key_prefix, is_active, last_seen_at, created_at, branch_id, branch:branches(id, code, name)';

export const getDeviceByHash = (keyHash: string) =>
  supabaseAdmin
    .from('kiosk_devices')
    .select('id, name, is_active, key_hash, branch_id, branch:branches(id, code, name)')
    .eq('key_hash', keyHash)
    .maybeSingle();

export const touchDevice = (id: string) =>
  supabaseAdmin.from('kiosk_devices').update({ last_seen_at: new Date().toISOString() }).eq('id', id);

export const insertDevice = (fields: Record<string, unknown>) =>
  supabaseAdmin.from('kiosk_devices').insert(fields).select(SAFE_COLUMNS).single();

export const listDevices = (branchIds: string[] | null) => {
  let query = supabaseAdmin.from('kiosk_devices').select(SAFE_COLUMNS).order('created_at', { ascending: false });
  if (branchIds) query = query.in('branch_id', branchIds);
  return query;
};

export const deactivateDevice = (id: string, branchIds: string[] | null) => {
  let query = supabaseAdmin.from('kiosk_devices').update({ is_active: false }).eq('id', id);
  if (branchIds) query = query.in('branch_id', branchIds);
  return query.select('id').maybeSingle();
};

export const getKioskPasswordHash = (branchId: string) =>
  supabaseAdmin.from('employee_credentials').select('password_hash').eq('role', 'kiosk').eq('branch_id', branchId).maybeSingle();

export const upsertKioskPassword = (branchId: string, passwordHash: string, updatedBy: string | null) =>
  supabaseAdmin.from('employee_credentials').upsert(
    { role: 'kiosk', branch_id: branchId, password_hash: passwordHash, updated_at: new Date().toISOString(), updated_by: updatedBy },
    { onConflict: 'role,branch_id' },
  );

// Kiosk orders are written with the secret key: a kiosk has no account for RLS to check.
export const getProductsForPricing = (ids: string[]) =>
  supabaseAdmin.from('products').select('id, name, price, is_available, product_variants(id, price)').in('id', ids);

export const getSoldOutAmong = (branchId: string, ids: string[]) =>
  supabaseAdmin.from('branch_unavailable_products').select('product_id').eq('branch_id', branchId).in('product_id', ids);

export const insertOrder = (fields: Record<string, unknown>) => supabaseAdmin.from('orders').insert(fields).select('id').single();

export const insertOrderItems = (rows: Record<string, unknown>[]) => supabaseAdmin.from('order_items').insert(rows);

export const deleteOrder = (id: string) => supabaseAdmin.from('orders').delete().eq('id', id);

export const getDeviceOrder = (orderId: string, deviceId: string) =>
  supabaseAdmin.from('orders').select(WITH_ITEMS).eq('id', orderId).eq('kiosk_device_id', deviceId).maybeSingle();
