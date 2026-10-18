'use client';

import { useEffect, useState } from 'react';
import { getActiveBranches, type Branch } from '@/controllers/branchController';
import { call } from '@/utils/apiError';
import { onUpdate } from '@/utils/cache';
import { nearestBranch } from '@/utils/geo';
import { useUserPosition } from '@/hooks/usePosition';

// ---------------------------------------------------------------------------
// The branch list: active branches with location and hours (GET /branches).
// Fetched once per page load and shared by every component, like site images.
// ---------------------------------------------------------------------------

let branches: Branch[] | null = null;
let loaded = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

const load = () => {
  loaded ??= call(getActiveBranches())
    .then((data) => {
      branches = data ?? [];
      notify();
    })
    .catch(() => {
      // Let the next mount try again instead of caching the failure.
      loaded = null;
      branches ??= [];
      notify();
    });
  return loaded;
};

// The saved list shows at once; when the background check finds a change, show the new one.
if (typeof window !== 'undefined') {
  onUpdate((key) => {
    if (key !== 'branches:active') return;
    loaded = null;
    load();
  });
}

/** Call after a super admin adds or edits a branch. */
export const refreshBranches = () => {
  loaded = null;
  return load();
};

const useSubscription = () => {
  const [, rerender] = useState(0);
  useEffect(() => {
    const fn = () => rerender((n) => n + 1);
    listeners.add(fn);
    load();
    return () => {
      listeners.delete(fn);
    };
  }, []);
};

export function useBranches() {
  useSubscription();
  return { branches: branches ?? [], loading: branches === null };
}

// ---------------------------------------------------------------------------
// The customer's preferred branch, remembered in this browser. `explicit` is
// true once they picked it themselves; until then it is only a default (the
// nearest branch when location is allowed) and may be replaced.
// ---------------------------------------------------------------------------

const KEY = '3k.branch';

const readChoice = () => {
  try {
    const value = JSON.parse(localStorage.getItem(KEY));
    return value?.id ? value : null;
  } catch {
    return null;
  }
};

let choice = readChoice();

export const setSelectedBranch = (id, { explicit = true } = {}) => {
  choice = id ? { id, explicit } : null;
  try {
    if (choice) localStorage.setItem(KEY, JSON.stringify(choice));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: the choice still lasts for this page.
  }
  notify();
};

// Another tab picked a branch: follow it.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    choice = readChoice();
    notify();
  });
}

/**
 * The branch the customer orders from. Until they pick one themselves it is the
 * nearest branch, if the browser shares their location, else the first one, so
 * there is always somewhere to order from. `locate` asks for the location
 * (once per page load); without it a location another screen got is still used.
 */
export function useSelectedBranch({ locate = false } = {}) {
  const { branches: list, loading } = useBranches();
  const { position } = useUserPosition({ ask: locate });
  const chosen = list.find((b) => b.id === choice?.id) ?? null;
  const explicit = Boolean(chosen && choice?.explicit);
  const nearest = nearestBranch(list, position);

  useEffect(() => {
    if (loading || explicit || list.length === 0) return;
    const fallback = nearest ?? chosen ?? list[0];
    if (fallback.id !== choice?.id) setSelectedBranch(fallback.id, { explicit: false });
  }, [loading, explicit, list, nearest, chosen]);

  const branch = chosen ?? list[0] ?? null;
  return {
    branch,
    branchId: branch?.id ?? null,
    explicit,
    // Whether the current branch was picked for them as the nearest one.
    isNearest: Boolean(nearest && branch && nearest.id === branch.id),
    position,
    select: (id) => setSelectedBranch(id),
    branches: list,
    loading,
  };
}
