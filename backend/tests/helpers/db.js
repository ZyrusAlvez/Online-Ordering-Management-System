import { createClient } from '@supabase/supabase-js';

/**
 * Direct database access for arranging preconditions and asserting on state
 * the API does not expose. Uses the secret key, so it bypasses RLS.
 */
export const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const orderRow = async (id, columns = '*') => {
  const { data, error } = await db.from('orders').select(columns).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
};

export const paymentsFor = async (orderId) => {
  const { data, error } = await db.from('payments').select('*').eq('order_id', orderId);
  if (error) throw error;
  return data;
};

/** Forces an order into a given state, to arrange a test precondition. */
export const setOrderState = async (id, patch) => {
  const { error } = await db.from('orders').update(patch).eq('id', id);
  if (error) throw error;
};
