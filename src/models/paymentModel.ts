import { supabase } from '@/utils/supabase';

export const insertPayment = (fields: Record<string, unknown>) => supabase.from('payments').insert(fields);

export const latestGcashPayment = (orderId: string) =>
  supabase
    .from('payments')
    .select('id, status, reference_number, receipt_path, failure_reason, created_at, verified_at')
    .eq('order_id', orderId)
    .eq('provider', 'gcash')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

/** Updates this order's payments of a provider that are in `fromStatus`. */
export const updatePayments = (
  orderId: string,
  where: { provider?: string; status: string },
  changes: Record<string, unknown>,
) => {
  let query = supabase
    .from('payments')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('order_id', orderId)
    .eq('status', where.status);
  if (where.provider) query = query.eq('provider', where.provider);
  return query;
};

export const getPaymentsInStatus = (orderId: string, status: string) =>
  supabase.from('payments').select('id, raw').eq('order_id', orderId).eq('status', status);

export const updatePayment = (id: string, changes: Record<string, unknown>) =>
  supabase.from('payments').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id);
