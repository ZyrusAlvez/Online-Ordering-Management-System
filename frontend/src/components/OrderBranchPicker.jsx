import { useSelectedBranch } from '../lib/branches.js';
import { byDistance, formatKm, hoursLabel, isOpenNow } from '../lib/geo.js';
import { Select } from './ui.jsx';
import { Store } from './icons.jsx';

/**
 * The customer's branch, as a dropdown sorted nearest first. Asks for their
 * location (once per page load) so the default is the nearest branch until
 * they choose one; choosing is remembered in this browser.
 */
export default function OrderBranchPicker({ compact = false }) {
  const { branch, branches, select, position, isNearest, explicit } = useSelectedBranch({ locate: true });
  if (!branch) return null;

  const options = byDistance(branches, position);
  const open = isOpenNow(branch);
  const label = (b) =>
    [b.name, b.distanceKm != null && formatKm(b.distanceKm), !isOpenNow(b) && 'closed now'].filter(Boolean).join(' · ');

  const picker = (
    <Select
      value={branch.id}
      onChange={(e) => select(e.target.value)}
      aria-label="Branch to order from"
      className={compact ? '!w-auto !py-1.5 text-sm font-semibold' : ''}
    >
      {options.map((b) => (
        <option key={b.id} value={b.id}>
          {label(b)}
        </option>
      ))}
    </Select>
  );

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Store size={16} className="text-ink-soft" />
        <span className="text-ink-soft">Ordering from</span>
        {picker}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {picker}
      <p className="text-xs text-ink-soft">
        {branch.address ? `${branch.address} · ` : ''}
        <span className={open ? 'font-semibold text-green-700' : 'font-semibold text-amber-700'}>
          {open ? 'Open now' : 'Closed now'}
        </span>{' '}
        · {hoursLabel(branch)}
        {isNearest && !explicit ? ' · nearest to you' : ''}
      </p>
    </div>
  );
}
