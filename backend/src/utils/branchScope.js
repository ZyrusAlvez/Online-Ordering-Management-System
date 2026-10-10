import { ApiError } from './ApiError.js';

/**
 * A branch scope is what a staff account may see:
 *   { all: true,  ids: null }   - a super admin, every branch
 *   { all: false, ids: [...] }  - everyone else, the branches they work at
 *
 * These helpers are pure so the rules can be unit-tested without a database.
 */
export const ALL_BRANCHES = Object.freeze({ all: true, ids: null });

export const scopeOf = (ids) => ({ all: false, ids: [...ids] });

export const canAccessBranch = (scope, branchId) =>
  Boolean(scope?.all || (branchId && scope?.ids?.includes(branchId)));

/** 403 if the caller does not work at that branch. */
export const assertBranchAccess = (scope, branchId) => {
  if (!canAccessBranch(scope, branchId)) {
    throw ApiError.forbidden('You do not have access to this branch');
  }
};

/**
 * Which branches a list should cover. A requested branch narrows it (and must be
 * in scope); otherwise it is every branch in scope, or null for "no filter".
 */
export const branchFilter = (scope, requested) => {
  if (requested) {
    assertBranchAccess(scope, requested);
    return [requested];
  }
  return scope.all ? null : scope.ids;
};

/**
 * The single branch an action happens at. Someone who works at one branch never
 * has to say which; an admin with several (or a super admin) must name one.
 */
export const resolveBranch = (scope, requested) => {
  if (requested) {
    assertBranchAccess(scope, requested);
    return requested;
  }
  if (!scope.all && scope.ids.length === 1) return scope.ids[0];
  throw ApiError.badRequest('Choose a branch (branch_id)', { branch_id: ['Required'] });
};
