import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALL_BRANCHES,
  assertBranchAccess,
  branchFilter,
  canAccessBranch,
  resolveBranch,
  scopeOf,
} from '../../src/utils/branchScope.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('branch scope', () => {
  it('lets a super admin into every branch', () => {
    assert.equal(canAccessBranch(ALL_BRANCHES, A), true);
    assert.equal(branchFilter(ALL_BRANCHES), null, 'no filter at all');
    assert.deepEqual(branchFilter(ALL_BRANCHES, B), [B]);
  });

  it('keeps everyone else to their own branches', () => {
    const scope = scopeOf([A]);
    assert.equal(canAccessBranch(scope, A), true);
    assert.equal(canAccessBranch(scope, B), false);
    assert.deepEqual(branchFilter(scope), [A]);
    assert.throws(() => branchFilter(scope, B), (err) => err.status === 403);
    assert.throws(() => assertBranchAccess(scope, B), (err) => err.status === 403);
  });

  it('gives someone with no branches nothing rather than everything', () => {
    const scope = scopeOf([]);
    assert.deepEqual(branchFilter(scope), []);
    assert.equal(canAccessBranch(scope, A), false);
  });

  it('picks the only branch, but makes an admin of several choose', () => {
    assert.equal(resolveBranch(scopeOf([A])), A);
    assert.throws(() => resolveBranch(scopeOf([A, B])), (err) => err.status === 400);
    assert.throws(() => resolveBranch(ALL_BRANCHES), (err) => err.status === 400);
    assert.equal(resolveBranch(scopeOf([A, B]), B), B);
    assert.throws(() => resolveBranch(scopeOf([A]), B), (err) => err.status === 403);
  });
});
