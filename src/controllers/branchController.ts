import * as branchModel from '@/models/branchModel';
import type { BranchRow } from '@/models/branchModel';
import { fail, fromDbError, ok, type Result } from '@/utils/result';
import { validate } from '@/utils/validate';
import { createBranchSchema, updateBranchSchema } from '@/utils/validators/branch.validators';

export type Branch = Omit<BranchRow, 'latitude' | 'longitude'> & { latitude: number; longitude: number };

/** Postgres returns time as "08:00:00" and numeric as strings; screens use "08:00" and numbers. */
export const shapeBranch = (row: BranchRow): Branch => ({
  ...row,
  latitude: Number(row.latitude),
  longitude: Number(row.longitude),
  opens_at: row.opens_at?.slice(0, 5) ?? null,
  closes_at: row.closes_at?.slice(0, 5) ?? null,
});

export const getActiveBranches = async (): Promise<Result<Branch[]>> => {
  const { data, error } = await branchModel.getActiveBranches();
  if (error) return fromDbError(error, 'Failed to load branches');
  return ok((data ?? []).map(shapeBranch));
};

export const getAllBranches = async (): Promise<Result<Branch[]>> => {
  const { data, error } = await branchModel.getAllBranches();
  if (error) return fromDbError(error, 'Failed to load branches');
  return ok((data ?? []).map(shapeBranch));
};

export const createBranch = async (input: unknown): Promise<Result<Branch>> => {
  const body = validate(createBranchSchema, input);
  if (body.success === false) return body;
  const { data, error } = await branchModel.insertBranch(body.data as Partial<BranchRow>);
  if (error) return fromDbError(error, 'Failed to create branch');
  return ok(shapeBranch(data));
};

/** There is no delete: orders, kiosks and staff reference a branch, so a closed one is deactivated. */
export const updateBranch = async (id: string, input: unknown): Promise<Result<Branch>> => {
  const body = validate(updateBranchSchema, input);
  if (body.success === false) return body;
  const { data, error } = await branchModel.updateBranch(id, body.data as Partial<BranchRow>);
  if (error) return fromDbError(error, 'Failed to update branch');
  if (!data) return fail('Branch not found', 404);
  return ok(shapeBranch(data));
};

export const getSoldOutIds = async (branchId: string | null): Promise<Set<string>> => {
  if (!branchId) return new Set();
  const { data } = await branchModel.getSoldOut(branchId);
  return new Set((data ?? []).map((row) => row.product_id as string));
};

export const setSoldOut = async (branchId: string, productId: string, soldOut: boolean): Promise<Result<null>> => {
  const { error } = soldOut
    ? await branchModel.insertSoldOut(branchId, productId)
    : await branchModel.deleteSoldOut(branchId, productId);
  if (error) return fromDbError(error, 'Failed to update availability');
  return ok(null);
};
