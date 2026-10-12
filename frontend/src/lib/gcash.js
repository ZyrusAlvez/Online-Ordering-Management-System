import { useEffect, useState } from 'react';
import { api } from './api.js';

/**
 * The GCash account customers pay into ({ name, number, qr_image }), set in the
 * backend's .env. undefined while loading; null when GCash is switched off.
 */
let account;
let loaded = null;
const listeners = new Set();

/** Fetches once per page load. */
const load = () => {
  loaded ??= api
    .get('/site/gcash')
    .then((res) => {
      account = res.data ?? null;
      listeners.forEach((fn) => fn());
    })
    .catch(() => {
      // Let a later mount try again rather than hiding GCash for the whole visit.
      loaded = null;
    });
  return loaded;
};

export function useGcashAccount() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const fn = () => rerender((n) => n + 1);
    listeners.add(fn);
    load();
    return () => listeners.delete(fn);
  }, []);

  return account;
}
