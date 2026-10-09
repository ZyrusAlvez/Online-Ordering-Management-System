import { formatKm, hoursLabel, isOpenNow } from '../lib/geo.js';
import { Badge, Button } from './ui.jsx';
import { Pin } from './icons.jsx';

/**
 * The branches as cards beside the map: nearest first once the customer's
 * location is known. `branches` come from byDistance(), so each may carry
 * `distanceKm`.
 */
export default function BranchList({ branches, selectedId, onSelect, className = '' }) {
  return (
    <ul className={`space-y-2 ${className}`}>
      {branches.map((b, i) => {
        const selected = b.id === selectedId;
        const open = isOpenNow(b);
        return (
          <li
            key={b.id}
            className={`rounded-2xl border p-4 transition ${selected ? 'border-brand bg-brand/5' : 'border-line bg-white'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">
                  {b.name}
                  {i === 0 && b.distanceKm != null && (
                    <span className="ml-2 align-middle text-[11px] font-semibold uppercase tracking-wide text-sun-dark">
                      Nearest
                    </span>
                  )}
                </p>
                {b.address && (
                  <p className="mt-0.5 flex items-start gap-1 text-xs text-ink-soft">
                    <Pin size={13} className="mt-px shrink-0" /> {b.address}
                  </p>
                )}
                <p className="mt-1 text-xs text-ink-soft">
                  <span className={open ? 'font-semibold text-green-700' : 'font-semibold text-amber-700'}>
                    {open ? 'Open now' : 'Closed now'}
                  </span>{' '}
                  · {hoursLabel(b)}
                  {b.distanceKm != null && ` · ${formatKm(b.distanceKm)} away`}
                </p>
              </div>
              {selected ? (
                <Badge tone="green" className="shrink-0 whitespace-nowrap">Your branch</Badge>
              ) : (
                <Button size="sm" tone="outline" className="shrink-0 whitespace-nowrap" onClick={() => onSelect(b.id)}>
                  Order here
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
