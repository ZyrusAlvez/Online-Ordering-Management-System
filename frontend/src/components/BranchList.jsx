import { directionsUrl, formatKm, hoursLabel, isOpenNow } from '../lib/geo.js';
import { Badge, Button } from './ui.jsx';
import { Check, Navigate, Pin } from './icons.jsx';

const OpenStatus = ({ branch }) => {
  const open = isOpenNow(branch);
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold ${open ? 'text-leaf' : 'text-amber-700'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-leaf' : 'bg-amber-500'}`} aria-hidden="true" />
      {open ? 'Open now' : 'Closed now'}
    </span>
  );
};

/** A branch as a card: everything to choose it at a glance, with the action at the bottom. */
function BranchCard({ branch: b, nearest, selected, onSelect }) {
  return (
    <li
      className={`flex flex-col rounded-2xl border p-4 transition ${
        selected ? 'border-brand bg-brand/[0.04] ring-1 ring-brand/30' : 'border-line bg-white hover:border-ink/25 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{b.name}</p>
          {nearest && <p className="text-[11px] font-semibold uppercase tracking-wide text-sun-dark">Nearest to you</p>}
        </div>
        {b.distanceKm != null && (
          <span className="shrink-0 rounded-full bg-cream-deep px-2 py-0.5 text-xs font-medium text-ink-soft">
            {formatKm(b.distanceKm)}
          </span>
        )}
      </div>

      <p className="mt-2 text-xs text-ink-soft">
        <OpenStatus branch={b} /> · {hoursLabel(b)}
      </p>
      {b.address && (
        <p className="mt-1 flex items-start gap-1 text-xs text-ink-soft">
          <Pin size={13} className="mt-px shrink-0" /> {b.address}
        </p>
      )}
      <a
        href={directionsUrl(b)}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex w-fit items-center gap-1 text-xs font-semibold text-ink-soft hover:text-brand"
      >
        <Navigate size={13} /> Directions
      </a>

      <div className="mt-auto pt-4">
        {selected ? (
          <p className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-leaf-soft text-sm font-semibold text-leaf">
            <Check size={16} /> Your branch
          </p>
        ) : (
          <Button size="sm" tone="outline" className="h-9 w-full" onClick={() => onSelect(b.id)}>
            Order here
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * The branches: nearest first once the customer's location is known.
 * `branches` come from byDistance(), so each may carry `distanceKm`.
 *
 *   layout  'list' (stacked rows, e.g. beside a map) | 'grid' (a card per branch)
 */
export default function BranchList({ branches, selectedId, onSelect, layout = 'list', className = '' }) {
  if (layout === 'grid') {
    return (
      <ul className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-4 ${className}`}>
        {branches.map((b, i) => (
          <BranchCard
            key={b.id}
            branch={b}
            nearest={i === 0 && b.distanceKm != null}
            selected={b.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </ul>
    );
  }

  return (
    <ul className={`space-y-2 ${className}`}>
      {branches.map((b, i) => {
        const selected = b.id === selectedId;
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
                <p className="mt-1 text-xs text-ink-soft">
                  <OpenStatus branch={b} /> · {hoursLabel(b)}
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
