import * as branchModel from '@/models/branchModel';
import type { BranchRow } from '@/models/branchModel';
import { fail, fromDbError, ok, type Result } from '@/utils/result';

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

export type BranchInput = {
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  latitude: number;
  longitude: number;
  opens_at?: string | null;
  closes_at?: string | null;
  is_active?: boolean;
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Same rules as the old branch validator; the table's check constraints back them up. */
export const validateBranch = (input: Partial<BranchInput>, partial = false): string | null => {
  const has = (k: keyof BranchInput) => input[k] !== undefined;
  if (!partial || has('code')) {
    if (!input.code || !/^[a-z0-9-]{2,30}$/.test(input.code)) return 'Code must be 2-30 lowercase letters, digits or dashes';
  }
  if (!partial || has('name')) {
    const name = input.name?.trim() ?? '';
    if (name.length < 1 || name.length > 80) return 'Name must be 1-80 characters';
  }
  if (has('address') && input.address && input.address.length > 300) return 'Address is too long';
  if (has('phone') && input.phone && !/^09\d{9}$/.test(input.phone)) return 'Phone must look like 09XXXXXXXXX';
  if (!partial || has('latitude') || has('longitude')) {
    const { latitude: lat, longitude: lng } = input;
    if (lat == null || lng == null || lat < 4 || lat > 22 || lng < 116 || lng > 128) {
      return 'Pin the branch on the map (inside the Philippines)';
    }
  }
  if (has('opens_at') || has('closes_at')) {
    const open = input.opens_at || null;
    const close = input.closes_at || null;
    if (Boolean(open) !== Boolean(close)) return 'Set both opening and closing time, or neither';
    if (open && close) {
      if (!HHMM.test(open) || !HHMM.test(close)) return 'Times must look like 08:00';
      if (close <= open) return 'Closing time must be after opening time';
    }
  }
  return null;
};

export const createBranch = async (input: BranchInput): Promise<Result<Branch>> => {
  const problem = validateBranch(input);
  if (problem) return fail(problem);
  const { data, error } = await branchModel.insertBranch({ ...input, name: input.name.trim() });
  if (error) return fromDbError(error, 'Failed to create branch');
  return ok(shapeBranch(data));
};

/** There is no delete: orders, kiosks and staff reference a branch, so a closed one is deactivated. */
export const updateBranch = async (id: string, input: Partial<BranchInput>): Promise<Result<Branch>> => {
  const problem = validateBranch(input, true);
  if (problem) return fail(problem);
  const { data, error } = await branchModel.updateBranch(id, input);
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
