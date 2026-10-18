import type { Result } from '@/utils/result';

/**
 * A read cache for controller results that never trades freshness for speed.
 *
 *  public   Data anyone may see (menu, sold-out flags, branches, the logo): stale-while-revalidate.
 *           A saved copy (memory, then localStorage) is returned at once so the page appears
 *           immediately, AND the latest version is fetched in the background every time. When it
 *           differs, the screens that read it are told (onUpdate) and re-render with it, usually
 *           within a fraction of a second. Nothing is ever trusted just because it is recent.
 *  private  Data about the signed-in person (their branches, their profile): no saved copy at
 *           all. Calls made within a few seconds of each other share one request (a screen often
 *           asks several times while it loads), kept in memory only and wiped whenever the
 *           signed-in user changes (clearPrivate, called by AuthContext).
 *
 * Orders, payments and chats are not cached; live updates refetch them. Order prices never come
 * from here: the database prices every order from the live menu.
 */

type Kind = 'public' | 'private';
type Entry = { value: unknown; at: number; kind: Kind };

const STORAGE_PREFIX = '3k.cache.';
/** A saved public copy older than this is not shown at all (the page waits for the fetch). */
const MAX_SAVED_AGE = 24 * 3600_000;
/** Background checks of the same key closer together than this are shared. */
const REVALIDATE_GAP = 2_000;
/** How long a private result is shared between calls. */
const PRIVATE_SHARE = 5_000;

const memory = new Map<string, Entry>();
const inFlight = new Map<string, Promise<Result<unknown>>>();
const lastChecked = new Map<string, number>();
const listeners = new Set<(key: string) => void>();

// --- which keys a screen read --------------------------------------------------------------
// A screen's loader calls the controllers synchronously up to their first await, which is when
// they call cached(); collecting the keys then tells useFetch what to listen for.
let collector: Set<string> | null = null;

/** Runs `fn` and returns the cache keys it read synchronously, with its result. */
export function collectKeys<T>(fn: () => T): { result: T; keys: Set<string> } {
  const keys = new Set<string>();
  const previous = collector;
  collector = keys;
  try {
    return { result: fn(), keys };
  } finally {
    collector = previous;
  }
}

/** Called with a key whenever fresh data for it replaced a different saved copy. */
export function onUpdate(listener: (key: string) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// --- storage ---------------------------------------------------------------------------------
const readStored = (key: string): Entry | null => {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? { ...(JSON.parse(raw) as { value: unknown; at: number }), kind: 'public' } : null;
  } catch {
    return null; // private mode, full storage, or not in a browser
  }
};

const writeStored = (key: string, entry: Entry) => {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ value: entry.value, at: entry.at }));
  } catch {
    // ignore: the memory copy still works for this page
  }
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Fetches `key` (one request at a time per key) and stores a success. */
function fetchFresh<T>(key: string, kind: Kind, load: () => Promise<Result<T>>): Promise<Result<T>> {
  const pending = inFlight.get(key) as Promise<Result<T>> | undefined;
  if (pending) return pending;

  lastChecked.set(key, Date.now());
  const request = load()
    .then((result) => {
      if (result.success) {
        const previous = memory.get(key);
        const entry: Entry = { value: result.data, at: Date.now(), kind };
        memory.set(key, entry);
        if (kind === 'public') writeStored(key, entry);
        if (previous && !same(previous.value, result.data)) listeners.forEach((fn) => fn(key));
      }
      return result;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request as Promise<Result<unknown>>);
  return request;
}

/** Returns `key` from the cache under the rules above, loading it with `load`. */
export async function cached<T>(key: string, kind: Kind, load: () => Promise<Result<T>>): Promise<Result<T>> {
  collector?.add(key); // before any await: see collectKeys
  const now = Date.now();

  if (kind === 'private') {
    const hit = memory.get(key);
    if (hit && now - hit.at < PRIVATE_SHARE) return { success: true, data: hit.value as T };
    return fetchFresh(key, kind, load);
  }

  let saved = memory.get(key) ?? null;
  if (!saved) {
    const stored = readStored(key);
    if (stored && now - stored.at < MAX_SAVED_AGE) {
      saved = stored;
      memory.set(key, stored);
    }
  }
  if (!saved) return fetchFresh(key, kind, load);

  // Show the saved copy now; check for a newer one in the background (failures keep the copy).
  if (now - (lastChecked.get(key) ?? 0) > REVALIDATE_GAP) fetchFresh(key, kind, load).catch(() => {});
  return { success: true, data: saved.value as T };
}

/** Forgets every entry whose key starts with `prefix`, so the next read waits for fresh data. */
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
