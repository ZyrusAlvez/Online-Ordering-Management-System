'use server';

import * as accountModel from '@/models/server/accountModel';
import * as kioskModel from '@/models/server/kioskModel';
import { ADMIN_ROLES } from '@/constants/orders';
import { branchFilter, callerCanAccess, verifyCaller } from '@/controllers/server/serverCaller';
import {
  createStaffUser,
  getStaffProfile,
  setCashierPassword,
  setKioskPassword,
  setStaffBranches,
} from '@/controllers/server/accounts';
import { issueKioskDevice } from '@/controllers/server/kioskDevices';
import { manilaBounds } from '@/utils/manilaDate';
import { validate } from '@/utils/validate';
import {
  adminListQuery,
  createAdminSchema,
  createKioskSchema,
  createRiderSchema,
  riderListQuery,
  salesQuery,
  updateAdminSchema,
  updateRiderSchema,
} from '@/utils/validators/admin.validators';
import { employeePasswordSchema, employeeRoleParam } from '@/utils/validators/employee.validators';
import { fail, fromDbError, ok } from '@/utils/result';

// Admin screens that need the secret key: managing other people's accounts, kiosk device keys,
// employee passwords and the sales report. Every action starts by verifying the caller's token.

const admins = [...ADMIN_ROLES];
const pageMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  pages: Math.max(1, Math.ceil(total / limit)),
});

const shapeList = (rows: any[]) =>
  rows.map(({ branch_staff: staff, scope: _scope, ...p }) => ({ ...p, branches: (staff ?? []).map((r: any) => r.branch).filter(Boolean) }));

// --- Riders (any admin, for their branches) ---------------------------------

export async function listRiders(token: string, query: unknown = {}) {
  const caller = await verifyCaller(token, admins);
  if (caller.success === false) return caller;
  const q = validate(riderListQuery, query);
  if (q.success === false) return q;

  const branchIds = branchFilter(caller.data, q.data.branch_id);
  if (branchIds && branchIds.length === 0) return ok({ data: [], meta: pageMeta(q.data.page, q.data.limit, 0) });
  const { data, error, count } = await accountModel.listProfiles(['rider'], branchIds, q.data.page, q.data.limit);
  if (error) return fromDbError(error, 'Failed to load riders');
  return ok({ data: shapeList(data ?? []), meta: pageMeta(q.data.page, q.data.limit, count ?? 0) });
}

export async function createRider(token: string, input: unknown) {
  const caller = await verifyCaller(token, admins);
  if (caller.success === false) return caller;
  const body = validate(createRiderSchema, input);
  if (body.success === false) return body;
  if (!callerCanAccess(caller.data, body.data.branch_id)) return fail('You do not manage that branch', 403);

  const created = await createStaffUser({
    email: body.data.email,
    password: body.data.password,
    role: 'rider',
    fullName: body.data.full_name,
    phone: body.data.phone,
  });
  if (created.success === false) return created;
  const branches = await setStaffBranches(created.data.id, [body.data.branch_id]);
  if (branches.success === false) return branches;
  return ok(await getStaffProfile(created.data.id, ['rider']));
}

/** Scoped to riders at the caller's branches; anyone else is "not found". */
export async function updateRider(token: string, riderId: string, input: unknown) {
  const caller = await verifyCaller(token, admins);
  if (caller.success === false) return caller;
  const body = validate(updateRiderSchema, input);
  if (body.success === false) return body;

  const rider = await getStaffProfile(riderId, ['rider']);
  if (!rider || !rider.branches.some((b: any) => callerCanAccess(caller.data, b.id))) return fail('Rider not found', 404);

  const { branch_id: branchId, ...fields } = body.data;
  if (branchId) {
    if (!callerCanAccess(caller.data, branchId)) return fail('You do not manage that branch', 403);
    const moved = await setStaffBranches(riderId, [branchId]);
    if (moved.success === false) return moved;
  }
  if (Object.keys(fields).length) {
    const { error } = await accountModel.updateProfile(riderId, fields);
    if (error) return fromDbError(error);
  }
  return ok(await getStaffProfile(riderId, ['rider']));
}

// --- Admin accounts (super admin) -------------------------------------------

export async function listAdmins(token: string, query: unknown = {}) {
  const caller = await verifyCaller(token, ['super_admin']);
  if (caller.success === false) return caller;
  const q = validate(adminListQuery, query);
  if (q.success === false) return q;
  const { data, error, count } = await accountModel.listProfiles(['admin', 'super_admin'], null, q.data.page, q.data.limit);
  if (error) return fromDbError(error, 'Failed to load admins');
  return ok({ data: shapeList(data ?? []), meta: pageMeta(q.data.page, q.data.limit, count ?? 0) });
}

export async function createAdmin(token: string, input: unknown) {
  const caller = await verifyCaller(token, ['super_admin']);
  if (caller.success === false) return caller;
  const body = validate(createAdminSchema, input);
  if (body.success === false) return body;

  const created = await createStaffUser({
    email: body.data.email,
    password: body.data.password,
    role: 'admin',
    fullName: body.data.full_name,
    phone: body.data.phone,
  });
  if (created.success === false) return created;
  const branches = await setStaffBranches(created.data.id, body.data.branch_ids);
  if (branches.success === false) return branches;
  return ok(await getStaffProfile(created.data.id, ['admin']));
}

/** Branch admins only: a super admin's access is not edited from this screen. */
export async function updateAdmin(token: string, adminId: string, input: unknown) {
  const caller = await verifyCaller(token, ['super_admin']);
  if (caller.success === false) return caller;
  const body = validate(updateAdminSchema, input);
  if (body.success === false) return body;

  const admin = await getStaffProfile(adminId, ['admin']);
  if (!admin) return fail('Admin not found', 404);
  const { branch_ids: branchIds, ...fields } = body.data;
  if (branchIds) {
    const set = await setStaffBranches(adminId, branchIds);
    if (set.success === false) return set;
  }
  if (Object.keys(fields).length) {
    const { error } = await accountModel.updateProfile(adminId, fields);
    if (error) return fromDbError(error);
  }
  return ok(await getStaffProfile(adminId, ['admin']));
}

// --- Kiosk devices ------------------------------------------------------------

export async function listKiosks(token: string, branchId?: string | null) {
  const caller = await verifyCaller(token, admins);
  if (caller.success === false) return caller;
  const branchIds = branchFilter(caller.data, branchId);
  if (branchIds && branchIds.length === 0) return ok([]);
  const { data, error } = await kioskModel.listDevices(branchIds);
  if (error) return fromDbError(error, 'Failed to load kiosks');
  return ok(data ?? []);
}

export async function createKiosk(token: string, input: unknown) {
  const caller = await verifyCaller(token, admins);
  if (caller.success === false) return caller;
  const body = validate(createKioskSchema, input);
  if (body.success === false) return body;
  if (!callerCanAccess(caller.data, body.data.branch_id)) return fail('You do not manage that branch', 403);
  return issueKioskDevice(body.data.name, body.data.branch_id);
}

/** The row is kept (past orders reference it); the key just stops working. */
export async function revokeKiosk(token: string, deviceId: string) {
  const caller = await verifyCaller(token, admins);
  if (caller.success === false) return caller;
  const { data, error } = await kioskModel.deactivateDevice(deviceId, caller.data.branchIds);
  if (error) return fromDbError(error);
  if (!data) return fail('Kiosk device not found', 404);
  return ok(null);
}

// --- Employee gate passwords ------------------------------------------------------

/** Sets a branch's cashier or kiosk password. The first cashier password also creates the account. */
export async function setEmployeePassword(token: string, role: unknown, input: unknown) {
  const caller = await verifyCaller(token, admins);
  if (caller.success === false) return caller;
  const which = validate(employeeRoleParam, { role });
  if (which.success === false) return which;
  const body = validate(employeePasswordSchema, input);
  if (body.success === false) return body;
  const { branch_id: branchId, password } = body.data;
  if (!callerCanAccess(caller.data, branchId)) return fail('You do not manage that branch', 403);

  return which.data.role === 'kiosk'
    ? setKioskPassword(branchId, password, caller.data.user.id)
    : setCashierPassword(branchId, password);
}

// --- Sales report -------------------------------------------------------------------

/** Manila calendar days; defaults to the last 7 days. Done in SQL so busy months are not cut at 1000 rows. */
export async function getSalesReport(token: string, query: unknown = {}) {
  const caller = await verifyCaller(token, admins);
  if (caller.success === false) return caller;
  const q = validate(salesQuery, query);
  if (q.success === false) return q;
  const { from, to, branch_id: branchId } = q.data;
  const { start, end } = manilaBounds(from, to);
  const { data, error } = await accountModel.salesReport(start, end, branchFilter(caller.data, branchId));
  if (error) return fromDbError(error, 'Failed to load the report');
  return ok({ range: { from, to }, ...(data as object) });
}
