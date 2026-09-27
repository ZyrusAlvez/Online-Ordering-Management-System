import { supabaseAdmin, supabaseAnon } from '../config/supabase.js';
import { ApiError, fromPostgrestError } from '../utils/ApiError.js';
import { applyRange } from '../utils/pagination.js';

/**
 * Categories, products and variants — the menu's write side, plus the
 * paginated product list.
 *
 * Writes run on supabaseAdmin: the menu tables carry SELECT-only RLS policies,
 * so the caller-scoped client cannot write them. requireRole is the gate.
 */

const PRODUCTS = 'products';
const CATEGORIES = 'categories';

const WITH_RELATIONS =
  '*, category:categories(id, name), variants:product_variants(id, label, price, sort_order)';

const orderVariants = (query) => query.order('sort_order', { referencedTable: 'product_variants' });

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export const listCategories = async () => {
  const { data, error } = await supabaseAnon.from(CATEGORIES).select('*').order('sort_order');
  if (error) throw fromPostgrestError(error);
  return data;
};

export const createCategory = async (payload) => {
  const { data, error } = await supabaseAdmin.from(CATEGORIES).insert(payload).select().single();
  if (error) throw fromPostgrestError(error);
  return data;
};

export const updateCategory = async (id, payload) => {
  const { data, error } = await supabaseAdmin
    .from(CATEGORIES)
    .update(payload)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw fromPostgrestError(error);
  if (!data) throw ApiError.notFound('Category not found');
  return data;
};

export const deleteCategory = async (id) => {
  const { error } = await supabaseAdmin.from(CATEGORIES).delete().eq('id', id);
  if (error) throw fromPostgrestError(error);
};

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
export const listProducts = async ({ page, limit, search, categoryId, available }) => {
  let query = orderVariants(
    applyRange(
      supabaseAnon
        .from(PRODUCTS)
        .select(WITH_RELATIONS, { count: 'exact' })
        // sort_order is per-category, so many products share a value. Without
        // a unique tiebreaker the order of tied rows is not stable between
        // queries, and pages then overlap and skip rows.
        .order('sort_order')
        .order('id'),
      { page, limit },
    ),
  );

  if (search) query = query.ilike('name', `%${search}%`);
  if (categoryId) query = query.eq('category_id', categoryId);
  if (available) query = query.eq('is_available', available === 'true');

  const { data, error, count } = await query;
  if (error) throw fromPostgrestError(error);

  return { data, total: count ?? 0 };
};

export const getProduct = async (id, client = supabaseAnon) => {
  const { data, error } = await orderVariants(
    client.from(PRODUCTS).select(WITH_RELATIONS).eq('id', id),
  ).maybeSingle();

  if (error) throw fromPostgrestError(error);
  if (!data) throw ApiError.notFound('Product not found');
  return data;
};

export const createProduct = async ({ variants, ...product }) => {
  const { data: created, error } = await supabaseAdmin
    .from(PRODUCTS)
    .insert(product)
    .select()
    .single();

  if (error) throw fromPostgrestError(error);

  if (variants?.length) {
    const { error: variantsError } = await supabaseAdmin
      .from('product_variants')
      .insert(variants.map((variant) => ({ ...variant, product_id: created.id })));

    if (variantsError) {
      // Do not leave a product behind that the caller never successfully made.
      await supabaseAdmin.from(PRODUCTS).delete().eq('id', created.id);
      throw fromPostgrestError(variantsError);
    }
  }

  return getProduct(created.id, supabaseAdmin);
};

export const updateProduct = async (id, { variants, ...product }) => {
  if (Object.keys(product).length > 0) {
    const { error } = await supabaseAdmin.from(PRODUCTS).update(product).eq('id', id);
    if (error) throw fromPostgrestError(error);
  }

  // Replace the full variant list when one is provided.
  if (variants) {
    const { error: deleteError } = await supabaseAdmin
      .from('product_variants')
      .delete()
      .eq('product_id', id);
    if (deleteError) throw fromPostgrestError(deleteError);

    if (variants.length) {
      const { error: insertError } = await supabaseAdmin
        .from('product_variants')
        .insert(variants.map((variant) => ({ ...variant, product_id: id })));
      if (insertError) throw fromPostgrestError(insertError);
    }
  }

  return getProduct(id, supabaseAdmin);
};

export const deleteProduct = async (id) => {
  const { error } = await supabaseAdmin.from(PRODUCTS).delete().eq('id', id);
  if (error) throw fromPostgrestError(error);
};

// ---------------------------------------------------------------------------
// Full menu
// ---------------------------------------------------------------------------

// The kiosk, POS and online app all render exactly this shape, so serving it
// pre-nested saves each of them an N+1 over /categories then /products.
const FULL_MENU =
  'id, name, sort_order, ' +
  'products(id, name, description, price, image_url, is_available, customizations, sort_order, ' +
  'variants:product_variants(id, label, price, sort_order))';

export const getFullMenu = async ({ includeUnavailable = false } = {}) => {
  let query = supabaseAnon
    .from(CATEGORIES)
    .select(FULL_MENU)
    .order('sort_order')
    .order('sort_order', { referencedTable: 'products' })
    .order('sort_order', { referencedTable: 'products.product_variants' });

  if (!includeUnavailable) query = query.eq('products.is_available', true);

  const { data, error } = await query;
  if (error) throw fromPostgrestError(error);
  return data;
};
