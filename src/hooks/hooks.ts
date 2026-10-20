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

/**
 * A wait before something may be done again ("Resend code in 30s"). `start()` begins it;
 * `left` is the whole seconds remaining, 0 when it is allowed.
 */
export function useCooldown(seconds: number, startNow = false) {
  const [until, setUntil] = useState(() => (startNow ? Date.now() + seconds * 1000 : 0));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= Date.now()) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  const start = useCallback(() => {
    setNow(Date.now());
    setUntil(Date.now() + seconds * 1000);
  }, [seconds]);
  return { left: Math.max(0, Math.ceil((until - now) / 1000)), start };
}
