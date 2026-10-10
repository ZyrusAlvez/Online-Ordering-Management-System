import { branchIdsOf } from '../services/branch.service.js';
import { getScopedOrderOrFail } from '../services/order.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ALL_BRANCHES, scopeOf } from '../utils/branchScope.js';

/**
 * Attaches req.branchScope: every branch for a super admin, otherwise the
 * branches in branch_staff. Read from the table on every request rather than
 * from the JWT, so removing an admin from a branch takes effect immediately.
 * Must run after requireAuth.
 */
export const loadBranchScope = asyncHandler(async (req, _res, next) => {
  req.branchScope =
    req.user.app_metadata?.role === 'super_admin' ? ALL_BRANCHES : scopeOf(await branchIdsOf(req.user.id));
  next();
});

/**
 * Loads the order in req.params.id into req.order, or 404s if it belongs to a
 * branch the caller does not work at (404, not 403, so ids of other branches'
 * orders are not confirmed). Must run after loadBranchScope.
 */
export const requireOrderInScope = asyncHandler(async (req, _res, next) => {
  req.order = await getScopedOrderOrFail(req.params.id, req.branchScope);
  next();
});
