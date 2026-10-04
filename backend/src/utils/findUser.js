import { supabaseAdmin } from '../config/supabase.js';

/**
 * Finds an auth user by email. Supabase has no lookup-by-email in the admin API,
 * and listUsers returns one page at a time, so this walks the pages (it used to
 * read only the first 1000, after which a real account could look "missing").
 */
export const findUserByEmail = async (email) => {
  const wanted = email.toLowerCase();
  const perPage = 200;

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const hit = data.users.find((u) => u.email?.toLowerCase() === wanted);
    if (hit) return hit;
    if (data.users.length < perPage) return null;
  }
  return null;
};
