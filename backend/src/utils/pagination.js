/**
 * Pagination shaping, shared by every list endpoint so the `meta` block is
 * identical across the API.
 */

/** Applies a zero-indexed range to a PostgREST query from 1-indexed paging. */
export const applyRange = (query, { page, limit }) => {
  const offset = (page - 1) * limit;
  return query.range(offset, offset + limit - 1);
};

export const buildMeta = ({ page, limit, total }) => ({
  page,
  limit,
  total: total ?? 0,
  pages: Math.ceil((total ?? 0) / limit),
});
