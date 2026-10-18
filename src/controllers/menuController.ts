import * as menuModel from '@/models/menuModel';
import type { CategoryRow, ProductRow } from '@/models/menuModel';
import { getSoldOutIds } from '@/controllers/branchController';
import { removePublicImage, uploadPublicImage } from '@/controllers/storageController';
import { fail, fromDbError, ok, type Result } from '@/utils/result';
import { validate } from '@/utils/validate';
import { categoryBody, productBody } from '@/utils/validators/catalog.validators';

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

export const createCategory = async (input: unknown) => {
  const body = validate(categoryBody, input);
  if (body.success === false) return body;
  const { data, error } = await menuModel.insertCategory({ name: body.data.name, sort_order: body.data.sort_order ?? 0 });
  if (error) return fromDbError(error, 'Failed to create category');
  return ok(data);
};

export const updateCategory = async (id: string, input: unknown) => {
  const body = validate(categoryBody.partial(), input);
  if (body.success === false) return body;
  const { data, error } = await menuModel.updateCategory(id, body.data);
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

export type VariantInput = { label: string; price?: number | null; sort_order?: number };

/** Options are matched by label when a product is edited, so a label may appear once. */
const duplicateLabel = (variants?: VariantInput[]) => {
  const seen = new Set<string>();
  for (const v of variants ?? []) {
    if (seen.has(v.label)) return `Option "${v.label}" is listed twice`;
    seen.add(v.label);
  }
  return null;
};

const getProduct = async (id: string) => {
  const { data, error } = await menuModel.getProduct(id);
  if (error) return fromDbError(error, 'Failed to load product');
  if (!data) return fail('Product not found', 404);
  return ok(data);
};

export const createProduct = async (input: unknown) => {
  const body = validate(productBody, input);
  if (body.success === false) return body;
  const { variants: parsed, ...product } = body.data;
  const variants = parsed as VariantInput[] | undefined;
  const dup = duplicateLabel(variants);
  if (dup) return fail(dup);

  const { data: created, error } = await menuModel.insertProduct(product);
  if (error) return fromDbError(error, 'Failed to create product');

  if (variants?.length) {
    const { error: variantsError } = await menuModel.insertVariants(
      variants.map((v, i) => ({ label: v.label, price: v.price ?? null, sort_order: v.sort_order ?? i, product_id: created.id })),
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

  const labels = new Set(wanted.map((v) => v.label));
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
    const row = { label: v.label, price: v.price ?? null, sort_order: v.sort_order ?? i };
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

export const updateProduct = async (id: string, input: unknown) => {
  const body = validate(productBody.partial(), input);
  if (body.success === false) return body;
  const { variants: parsed, ...product } = body.data;
  const variants = parsed as VariantInput[] | undefined;
  const dup = duplicateLabel(variants);
  if (dup) return fail(dup);

  if (Object.keys(product).length > 0) {
    const { error } = await menuModel.updateProduct(id, product);
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
