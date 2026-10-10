import { useEffect, useState } from 'react';
import { api } from './api.js';

// Bundled fallback, used until the super admin uploads their own (and if the API is unreachable).
const DEFAULTS = { logo: '/brand/logo.jpg' };

let images = {};
let loaded = null;
const listeners = new Set();

const publish = (next) => {
  images = next;
  listeners.forEach((fn) => fn());
};

/** Fetches once per page load; call refreshSiteImages() after an admin changes one. */
const load = () => {
  loaded ??= api
    .get('/site/images')
    .then((res) => publish(res.data ?? {}))
    .catch(() => {});
  return loaded;
};

export const refreshSiteImages = (next) => {
  if (next) publish(next);
  else {
    loaded = null;
    load();
  }
};

export const siteImageDefault = (key) => DEFAULTS[key];

export function useSiteImage(key) {
  const [, rerender] = useState(0);
  useEffect(() => {
    const fn = () => rerender((n) => n + 1);
    listeners.add(fn);
    load();
    return () => listeners.delete(fn);
  }, []);

  return images[key] || DEFAULTS[key];
}
