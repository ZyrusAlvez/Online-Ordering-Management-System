import { supabaseAdmin } from '../config/supabase.js';
import { fromPostgrestError } from '../utils/ApiError.js';
import { manilaBounds } from '../utils/manilaDate.js';

/**
 * The sales report for a range of Manila days. The work is done by the
 * public.sales_report SQL function, because PostgREST returns at most 1000 rows per
 * request and a busy month of orders and their items would silently be cut off.
 * See supabase/migrations/20260926000000_sales_report.sql for what counts as a sale.
 */
export const getSalesReport = async ({ from, to }) => {
  const { start, end } = manilaBounds(from, to);

  const { data, error } = await supabaseAdmin.rpc('sales_report', { p_from: start, p_to: end });
  if (error) throw fromPostgrestError(error);

  return { range: { from, to }, ...data };
};
