import type { Result } from '@/utils/result';

/**
 * A small read cache for controller results, with two kinds of entry:
 *
 *  public   Data anyone may see (menu, branches, sold-out flags, the logo). Kept in memory and
 *           in localStorage, so a returning visitor sees the menu at once.
 *  private  Data about the signed-in person (their branches, their profile). Kept in memory
 *           ONLY: never written to the device, and dropped the moment anyone signs out or a
 *           different user signs in (clearPrivate, called by AuthContext).
 *
 * Orders, payments and chats are deliberately not cached at all: they change by the second and
 * live updates already refetch them.
 *
 * Only successful results are kept, concurrent calls for the same key share one request, and a
 * write that changes the data calls invalidate() so the next read is fresh.
 */

type Entry = { value: unknown; expires: number };
type Kind = 'public' | 'private';

const STORAGE_PREFIX = '3k.cache.';
const memory = new Map<string, Entry & { kind: Kind }>();
const inFlight = new Map<string, Promise<unknown>>();

const readStored = (key: string): Entry | null => {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? (JSON.parse(raw) as Entry) : null;
  } catch {
    return null; // private mode, full storage, or not in a browser
  }
};

const writeStored = (key: string, entry: Entry) => {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // ignore: the memory copy still works for this page
  }
};

/** Returns the cached result for `key` while it is fresh, otherwise runs `load` and keeps a success. */
export async function cached<T>(
  key: string,
  { ttlMs, kind }: { ttlMs: number; kind: Kind },
  load: () => Promise<Result<T>>,
): Promise<Result<T>> {
  const now = Date.now();
  const hit = memory.get(key);
  if (hit && hit.expires > now) return { success: true, data: hit.value as T };

  if (kind === 'public') {
    const stored = readStored(key);
    if (stored && stored.expires > now) {
      memory.set(key, { ...stored, kind });
      return { success: true, data: stored.value as T };
    }
  }

  const pending = inFlight.get(key) as Promise<Result<T>> | undefined;
  if (pending) return pending;

  const request = load().then((result) => {
    if (result.success) {
      const entry = { value: result.data, expires: Date.now() + ttlMs };
      memory.set(key, { ...entry, kind });
      if (kind === 'public') writeStored(key, entry);
    }
    return result;
  });
  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
}

/** Forgets every entry whose key starts with `prefix` (in memory and on the device). */
export function invalidate(prefix: string) {
  for (const key of [...memory.keys()]) if (key.startsWith(prefix)) memory.delete(key);
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(STORAGE_PREFIX + prefix)) localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

/** Drops everything about the signed-in person. Public entries (the menu) stay. */
export function clearPrivate() {
  for (const [key, entry] of memory) if (entry.kind === 'private') memory.delete(key);
}
