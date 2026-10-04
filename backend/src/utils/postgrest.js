/**
 * Safe building blocks for PostgREST filters made from user text.
 *
 * `.or('a.ilike.%x%,b.ilike.%x%')` splits its argument on commas and reads
 * parentheses, so a search for "Cruz, Juan" or "Juan (Jr)" used to break the
 * filter (and one crafted value could add conditions). Values are double-quoted
 * here, and LIKE wildcards in the text are escaped so "100%" means 100%.
 */

/** Escapes the characters that have meaning to LIKE/ILIKE. */
export const escapeLike = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/** `%text%` with the user's wildcards neutralised, for `.ilike(column, ...)`. */
export const containsPattern = (text) => `%${escapeLike(text)}%`;

/** The same pattern wrapped for use inside `.or(...)` (double-quoted, quotes/backslashes escaped). */
export const quotedContains = (text) =>
  `"${containsPattern(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** `.or()` expression matching `text` in any of `columns`, case-insensitively. */
export const anyColumnContains = (columns, text) =>
  columns.map((column) => `${column}.ilike.${quotedContains(text)}`).join(',');
