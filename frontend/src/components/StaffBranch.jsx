import { createContext, useContext, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { useFetch } from '../lib/hooks.js';
import { Field, Select } from './ui.jsx';
import { Store } from './icons.jsx';

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

export function StaffBranchProvider({ storageKey, allowAll = false, children }) {
  const { role } = useAuth();
  const profile = useFetch(() => api.get('/auth/profile', { auth: true }), []);
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
    // Spread into a request's query: narrows a list to the chosen branch, if any.
    query: branchId ? { branch_id: branchId } : {},
  };

  return <StaffBranchContext.Provider value={value}>{children}</StaffBranchContext.Provider>;
}

export const useStaffBranch = () => useContext(StaffBranchContext);

/** The branch switcher for the staff bar. A single branch is shown as a label. */
export function BranchPicker({ className = '' }) {
  const { branches, branchId, setBranchId, canChooseAll, isSuper } = useStaffBranch();
  if (branches.length === 0) return null;

  if (branches.length === 1) {
    return (
      <span className={`flex items-center gap-1.5 rounded-xl bg-cream-deep px-3 py-2 text-sm font-semibold ${className}`}>
        <Store size={15} /> {branches[0].name}
      </span>
    );
  }

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
export function BranchSelect({ value, onChange, label = 'Branch' }) {
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
