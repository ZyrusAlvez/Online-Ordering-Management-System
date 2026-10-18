import * as menuModel from '@/models/menuModel';
import type { CategoryRow, ProductRow } from '@/models/menuModel';
import { getSoldOutIds } from '@/controllers/branchController';
import { removePublicImage, uploadPublicImage } from '@/controllers/storageController';
import { fail, fromDbError, ok, type Result } from '@/utils/result';

export type MenuProduct = ProductRow & { available_everywhere?: boolean; sold_out_here?: boolean };
export type MenuCategory = Omit<CategoryRow, 'products'> & { products: MenuProduct[] };

/**
 * The menu as one branch sees it when `branchId` is given: a product that branch has sold out
 * comes back with is_available false (and sold_out_here true), exactly like one switched off
 * everywhere.
 */
export const getMenu = async ({
  includeUnavailable = false,
  branchId = null,
}: { includeUnavailable?: boolean; branchId?: string | null } = {}): Promise<Result<MenuCategory[]>> => {
  const [{ data, error }, soldOut] = await Promise.all([
    menuModel.getFullMenu(includeUnavailable),
    getSoldOutIds(branchId),
  ]);
  if (error) return fromDbError(error, 'Failed to load the menu');
  if (!branchId) return ok(data ?? []);

  return ok(
    (data ?? []).map((category) => ({
      ...category,
      products: category.products
        .map((p) => ({
          ...p,
          available_everywhere: p.is_available,
          sold_out_here: soldOut.has(p.id),
          is_available: p.is_available && !soldOut.has(p.id),
        }))
        .filter((p) => includeUnavailable || p.is_available),
    })),
  );
};

// ---------------------------------------------------------------------------
// Categories (super admin)
// ---------------------------------------------------------------------------

const validCategoryName = (name?: string) => {
  const n = name?.trim() ?? '';
  return n.length >= 1 && n.length <= 100 ? n : null;
};

export const createCategory = async (input: { name: string; sort_order?: number }) => {
  const name = validCategoryName(input.name);
  if (!name) return fail('Category name must be 1-100 characters');
  const { data, error } = await menuModel.insertCategory({ name, sort_order: input.sort_order ?? 0 });
  if (error) return fromDbError(error, 'Failed to create category');
  return ok(data);
};

export const updateCategory = async (id: string, input: { name?: string; sort_order?: number }) => {
  const fields: { name?: string; sort_order?: number } = {};
  if (input.name !== undefined) {
    const name = validCategoryName(input.name);
    if (!name) return fail('Category name must be 1-100 characters');
    fields.name = name;
  }
  if (input.sort_order !== undefined) fields.sort_order = input.sort_order;
  const { data, error } = await menuModel.updateCategory(id, fields);
  if (error) return fromDbError(error, 'Failed to update category');
  if (!data) return fail('Category not found', 404);
  return ok(data);
};

export const deleteCategory = async (id: string) => {
  const { error } = await menuModel.deleteCategory(id);
  if (error) return fromDbError(error, 'Failed to delete category');
  return ok(null);
};

// ---------------------------------------------------------------------------
// Products (super admin)
// ---------------------------------------------------------------------------

export type VariantInput = { label: string; price: number | null; sort_order?: number };

export type ProductInput = {
  category_id?: string | null;
  name?: string;
  description?: string | null;
  price?: number | null;
  image_url?: string | null;
  is_available?: boolean;
  customizations?: string[];
  sort_order?: number;
  variants?: VariantInput[];
};

const validPrice = (p: number | null | undefined) =>
  p == null || (Number.isFinite(p) && p >= 0 && p <= 999999.99 && Math.round(p * 100) === p * 100);

/** Same rules as the old product validator. */
const validateProduct = (input: ProductInput, partial: boolean): string | null => {
  if (!partial || input.name !== undefined) {
    const n = input.name?.trim() ?? '';
    if (n.length < 1 || n.length > 200) return 'Name must be 1-200 characters';
  }
  if (input.description && input.description.length > 2000) return 'Description is too long';
  if (!validPrice(input.price)) return 'Price must be 0 to 999999.99 with at most 2 decimals';
  if (input.variants) {
    if (input.variants.length > 30) return 'At most 30 options';
    const labels = new Set<string>();
    for (const v of input.variants) {
      const label = v.label?.trim() ?? '';
      if (label.length < 1 || label.length > 100) return 'Each option needs a label of 1-100 characters';
      if (labels.has(label)) return `Option "${label}" is listed twice`;
      labels.add(label);
      if (!validPrice(v.price)) return `Option "${label}" has an invalid price`;
    }
  }
  return null;
};

const getProduct = async (id: string) => {
  const { data, error } = await menuModel.getProduct(id);
  if (error) return fromDbError(error, 'Failed to load product');
  if (!data) return fail('Product not found', 404);
  return ok(data);
};

export const createProduct = async ({ variants, ...product }: ProductInput) => {
  const problem = validateProduct({ ...product, variants }, false);
  if (problem) return fail(problem);

  const { data: created, error } = await menuModel.insertProduct({ ...product, name: product.name?.trim() });
  if (error) return fromDbError(error, 'Failed to create product');

  if (variants?.length) {
    const { error: variantsError } = await menuModel.insertVariants(
      variants.map((v, i) => ({ ...v, label: v.label.trim(), sort_order: v.sort_order ?? i, product_id: created.id })),
    );
    if (variantsError) {
      // Do not leave behind a product the admin never successfully made.
      await menuModel.deleteProduct(created.id);
      return fromDbError(variantsError, 'Failed to save options');
    }
  }
  return getProduct(created.id);
};

/**
 * Makes the product's options match `wanted`, matching by label. Existing options are updated in
 * place (order lines point at them), new labels are added, the rest removed. An option with order
 * history cannot be removed; that is checked before anything changes.
 */
const syncVariants = async (productId: string, wanted: VariantInput[]): Promise<Result<null>> => {
  const { data: existing, error } = await menuModel.getVariants(productId);
  if (error) return fromDbError(error);

  const labels = new Set(wanted.map((v) => v.label.trim()));
  const removed = (existing ?? []).filter((v) => !labels.has(v.label));

  if (removed.length) {
    const { data: used, error: usedError } = await menuModel.getOrderedVariantIds(removed.map((v) => v.id));
    if (usedError) return fromDbError(usedError);
    const usedIds = new Set((used ?? []).map((row) => row.variant_id));
    const blocked = removed.filter((v) => usedIds.has(v.id)).map((v) => `"${v.label}"`);
    if (blocked.length) {
      return fail(
        `Option ${blocked.join(', ')} appears in past orders and cannot be removed. ` +
          'Clear its price to hide it from customers instead.',
        409,
      );
    }
  }

  const byLabel = new Map((existing ?? []).map((v) => [v.label, v.id]));
  for (const [i, v] of wanted.entries()) {
    const row = { label: v.label.trim(), price: v.price, sort_order: v.sort_order ?? i };
    const id = byLabel.get(row.label);
    const { error: writeError } = id
      ? await menuModel.updateVariant(id, row)
      : await menuModel.insertVariants([{ ...row, product_id: productId }]);
    if (writeError) return fromDbError(writeError, 'Failed to save options');
  }

  if (removed.length) {
    const { error: deleteError } = await menuModel.deleteVariants(removed.map((v) => v.id));
    if (deleteError) return fromDbError(deleteError, 'Failed to remove options');
  }
  return ok(null);
};

export const updateProduct = async (id: string, { variants, ...product }: ProductInput) => {
  const problem = validateProduct({ ...product, variants }, true);
  if (problem) return fail(problem);

  if (Object.keys(product).length > 0) {
    const { error } = await menuModel.updateProduct(id, product.name ? { ...product, name: product.name.trim() } : product);
    if (error) return fromDbError(error, 'Failed to update product');
  }
  if (variants) {
    const synced = await syncVariants(id, variants);
    if (synced.success === false) return synced;
  }
  return getProduct(id);
};

export const setProductImage = async (id: string, file: Blob) => {
  const current = await getProduct(id);
  if (current.success === false) return current;

  const uploaded = await uploadPublicImage(`products/${id}`, file);
  if (uploaded.success === false) return uploaded;

  const { error } = await menuModel.updateProduct(id, { image_url: uploaded.data });
  if (error) {
    await removePublicImage(uploaded.data);
    return fromDbError(error, 'Failed to save the image');
  }
  await removePublicImage(current.data.image_url);
  return getProduct(id);
};

export const clearProductImage = async (id: string) => {
  const current = await getProduct(id);
  if (current.success === false) return current;
  const { error } = await menuModel.updateProduct(id, { image_url: null });
  if (error) return fromDbError(error, 'Failed to remove the image');
  await removePublicImage(current.data.image_url);
  return getProduct(id);
};

export const deleteProduct = async (id: string) => {
  const current = await getProduct(id);
  if (current.success === false) return current;

  const { count, error: usedError } = await menuModel.countOrderLinesForProduct(id);
  if (usedError) return fromDbError(usedError);
  if ((count ?? 0) > 0) {
    return fail(
      'This product appears in past orders, so it cannot be deleted. Mark it as sold out to hide it from the menu.',
      409,
    );
  }

  const { error } = await menuModel.deleteProduct(id);
  if (error) return fromDbError(error, 'Failed to delete product');
  await removePublicImage(current.data.image_url);
  return ok(null);
};
