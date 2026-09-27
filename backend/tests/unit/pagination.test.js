import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyRange, buildMeta } from '../../src/utils/pagination.js';

describe('buildMeta', () => {
  it('computes page count from total and limit', () => {
    assert.deepEqual(buildMeta({ page: 1, limit: 20, total: 42 }), {
      page: 1,
      limit: 20,
      total: 42,
      pages: 3,
    });
  });

  it('reports zero pages for an empty result', () => {
    assert.equal(buildMeta({ page: 1, limit: 20, total: 0 }).pages, 0);
  });

  it('treats a missing total as zero rather than producing NaN', () => {
    const meta = buildMeta({ page: 1, limit: 20, total: undefined });
    assert.equal(meta.total, 0);
    assert.equal(meta.pages, 0);
  });

  it('does not round a partial last page down', () => {
    assert.equal(buildMeta({ page: 1, limit: 10, total: 11 }).pages, 2);
    assert.equal(buildMeta({ page: 1, limit: 10, total: 1 }).pages, 1);
  });

  it('reports exactly one page when total equals limit', () => {
    assert.equal(buildMeta({ page: 1, limit: 20, total: 20 }).pages, 1);
  });
});

describe('applyRange', () => {
  // A stub standing in for a PostgREST query builder.
  const spy = () => {
    const calls = [];
    return { calls, range: (from, to) => (calls.push([from, to]), 'ranged') };
  };

  it('converts 1-indexed pages into zero-indexed inclusive ranges', () => {
    const q = spy();
    applyRange(q, { page: 1, limit: 20 });
    assert.deepEqual(q.calls[0], [0, 19]);
  });

  it('offsets later pages correctly', () => {
    const q = spy();
    applyRange(q, { page: 3, limit: 20 });
    assert.deepEqual(q.calls[0], [40, 59]);
  });

  it('handles a limit of one', () => {
    const q = spy();
    applyRange(q, { page: 5, limit: 1 });
    assert.deepEqual(q.calls[0], [4, 4]);
  });

  it('returns whatever the query builder returns, for chaining', () => {
    assert.equal(applyRange(spy(), { page: 1, limit: 10 }), 'ranged');
  });
});
