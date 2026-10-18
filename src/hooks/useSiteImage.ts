'use client';

import { useEffect, useState } from 'react';
import { getSiteImages } from '@/controllers/siteController';
import { call } from '@/utils/apiError';

// Bundled fallback, used until the super admin uploads their own (and if the API is unreachable).
const DEFAULTS = { logo: '/brand/logo.jpg' };

let images = {};
let loaded = null;
const listeners = new Set<() => void>();

const publish = (next) => {
  images = next;
  listeners.forEach((fn) => fn());
};

/** Fetches once per page load; call refreshSiteImages() after an admin changes one. */
const load = () => {
  loaded ??= call(getSiteImages())
    .then((data) => publish(data ?? {}))
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
    return () => {
      listeners.delete(fn);
    };
  }, []);

  return images[key] || DEFAULTS[key];
}
