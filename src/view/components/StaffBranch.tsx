'use client';

import { createContext, useContext, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { respond } from '@/utils/apiError';
import { getMyProfile } from '@/controllers/profileController';
import { useFetch } from '@/hooks/hooks';
import { Field, Select } from '@/view/components/ui';
import { Store } from '@/view/components/icons';

/**
 * Which branch a staff screen is looking at. The branches come from the
 * account's profile (every branch for a super admin), so the picker never
 * offers one the API would refuse. With `allowAll`, '' means "all of mine".
 */
const StaffBranchContext = createContext(null);

const read = (key) => {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
};

export function StaffBranchProvider({ storageKey, allowAll = false, children }: any) {
  const { role } = useAuth();
  const profile = useFetch(() => respond(getMyProfile()), []);
  const branches = profile.data?.data?.branches ?? [];
  const [chosen, setChosen] = useState(() => read(storageKey));

  const canChooseAll = allowAll && branches.length > 1;
  let branchId = branches.some((b) => b.id === chosen) ? chosen : '';
  if (!branchId && !canChooseAll) branchId = branches[0]?.id ?? '';

  const setBranchId = (id) => {
    try {
      localStorage.setItem(storageKey, id);
    } catch {
      // not remembered across reloads, which is fine
    }
    setChosen(id);
  };

  const value = {
    branches,
    branchId,
    branch: branches.find((b) => b.id === branchId) ?? null,
    setBranchId,
    canChooseAll,
    isSuper: role === 'super_admin',
    loading: profile.loading,
    error: profile.error,
    // After a branch is added or renamed, so the switcher and pickers show it.
    reloadBranches: profile.refresh,
    // Spread into a request's query: narrows a list to the chosen branch, if any.
    query: branchId ? { branch_id: branchId } : {},
  };

  return <StaffBranchContext.Provider value={value}>{children}</StaffBranchContext.Provider>;
}

export const useStaffBranch = () => useContext(StaffBranchContext);

/** The branch switcher for the staff bar. Nothing for a single branch: the bar's title already names it. */
export function BranchPicker({ className = '' }: any) {
  const { branches, branchId, setBranchId, canChooseAll, isSuper } = useStaffBranch();
  if (branches.length <= 1) return null;

  return (
    <label className={`flex items-center gap-1.5 ${className}`}>
      <span className="sr-only">Branch</span>
      <Store size={16} className="hidden text-ink-soft sm:block" />
      <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="!w-auto !py-2 text-sm font-semibold">
        {canChooseAll && <option value="">{isSuper ? 'All branches' : 'All my branches'}</option>}
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
            {b.is_active ? '' : ' (closed)'}
          </option>
        ))}
      </Select>
    </label>
  );
}

/** A required branch choice inside a form, defaulting to the one being viewed. */
export function BranchSelect({ value, onChange, label = 'Branch' }: any) {
  const { branches } = useStaffBranch();
  return (
    <Field label={label}>
      <Select required value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          Choose a branch
        </option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}
