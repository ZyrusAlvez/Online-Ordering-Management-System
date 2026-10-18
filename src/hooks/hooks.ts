import { useCallback, useEffect, useRef, useState } from 'react';
import { collectKeys, onUpdate } from '@/utils/cache';

/**
 * Runs an async loader and tracks loading/error. `reload()` refetches without
 * flashing the spinner (`silent`), which is what live updates want.
 *
 * If the loader read cached public data (the menu, branches…), the saved copy shows at once and,
 * when the background check finds something newer, the loader re-runs silently to show it.
 */
export function useFetch(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const seq = useRef(0);
  const keys = useRef<Set<string>>(new Set());

  const run = useCallback(async (silent = false) => {
    const mine = (seq.current += 1);
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { result, keys: read } = collectKeys(() => loaderRef.current());
      keys.current = read;
      const data = await result;
      if (mine === seq.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (mine === seq.current) setState((s) => ({ data: silent ? s.data : null, error, loading: false }));
    }
  }, []);

  useEffect(() => {
    run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => onUpdate((key) => keys.current.has(key) && run(true)), [run]);

  // Stable identities: pages put `refresh` in effect dependency lists (to rebuild
  // a realtime subscription when it changes). A fresh function every render made
  // the subscription tear down and rejoin on every keystroke, losing events that
  // arrived in the gap.
  const reload = useCallback(() => run(false), [run]);
  const refresh = useCallback(() => run(true), [run]);

  return { ...state, reload, refresh };
}

/** Debounced copy of a value — for search boxes that hit the API. */
export function useDebounced(value, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Re-renders every `ms` (default a minute), for countdowns like "due in 12 min". */
export function useTick(ms = 60_000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), ms);
    return () => clearInterval(timer);
  }, [ms]);
}
