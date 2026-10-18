import { supabase } from '@/utils/supabase';

export type VariantRow = { id: string; label: string; price: number | string | null; sort_order: number };

export type ProductRow = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number | string | null;
  image_url: string | null;
  is_available: boolean;
  customizations: string[];
  sort_order: number;
  variants: VariantRow[];
};

export type CategoryRow = { id: string; name: string; sort_order: number; products: ProductRow[] };

// The kiosk, POS and online app all render exactly this nested shape.
const FULL_MENU =
  'id, name, sort_order, ' +
  'products(id, category_id, name, description, price, image_url, is_available, customizations, sort_order, ' +
  'variants:product_variants(id, label, price, sort_order))';

export const getFullMenu = (includeUnavailable: boolean) => {
  let query = supabase
    .from('categories')
    .select(FULL_MENU)
    .order('sort_order')
    .order('sort_order', { referencedTable: 'products' })
    .order('sort_order', { referencedTable: 'products.product_variants' });
  if (!includeUnavailable) query = query.eq('products.is_available', true);
  return query.returns<CategoryRow[]>();
};

export const insertCategory = (fields: { name: string; sort_order?: number }) =>
  supabase.from('categories').insert(fields).select().single();

export const updateCategory = (id: string, fields: { name?: string; sort_order?: number }) =>
  supabase.from('categories').update(fields).eq('id', id).select().maybeSingle();

export const deleteCategory = (id: string) => supabase.from('categories').delete().eq('id', id);

const WITH_RELATIONS = '*, category:categories(id, name), variants:product_variants(id, label, price, sort_order)';

export const getProduct = (id: string) =>
  supabase
    .from('products')
    .select(WITH_RELATIONS)
    .eq('id', id)
    .order('sort_order', { referencedTable: 'product_variants' })
    .maybeSingle();

export const insertProduct = (fields: Record<string, unknown>) =>
  supabase.from('products').insert(fields).select('id').single();

export const updateProduct = (id: string, fields: Record<string, unknown>) =>
  supabase.from('products').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id);

export const deleteProduct = (id: string) => supabase.from('products').delete().eq('id', id);

export const getVariants = (productId: string) =>
  supabase.from('product_variants').select('id, label').eq('product_id', productId);

export const insertVariants = (rows: Record<string, unknown>[]) => supabase.from('product_variants').insert(rows);

export const updateVariant = (id: string, fields: Record<string, unknown>) =>
  supabase.from('product_variants').update(fields).eq('id', id);

export const deleteVariants = (ids: string[]) => supabase.from('product_variants').delete().in('id', ids);

/** Whether a product or variant has been ordered (needs the staff read on order_items). */
export const countOrderLinesForProduct = (productId: string) =>
  supabase.from('order_items').select('id', { count: 'exact', head: true }).eq('product_id', productId);

export const getOrderedVariantIds = (variantIds: string[]) =>
  supabase.from('order_items').select('variant_id').in('variant_id', variantIds).limit(1000);
