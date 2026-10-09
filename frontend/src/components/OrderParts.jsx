import { Badge } from './ui.jsx';
import { Clock } from './icons.jsx';
import { useTick } from '../lib/hooks.js';
import { CHANNEL, FULFILLMENT, PAYMENT, STATUS, lineLabel, manilaClock, minutesUntil, money, scheduleLabel } from '../lib/format.js';

// --- Scheduled orders ------------------------------------------------------
// A customer can order for later. The counter must not start those early, nor
// miss them when they come due, so they are marked everywhere an order shows.

/** Within this many minutes a scheduled order is "due soon" and turns orange. */
export const DUE_SOON_MINUTES = 60;
/** How long before the slot the kitchen should start. */
export const PREP_MINUTES = 30;

const dueText = (minutes) => (minutes > 0 ? `due in ${minutes} min` : minutes > -60 ? 'due now' : 'overdue');

/** "⏰ Tomorrow, 8:00 AM", amber; orange with a countdown once it is close. */
export function ScheduledBadge({ at, className = '' }) {
  useTick();
  if (!at) return null;
  const minutes = minutesUntil(at);
  const soon = minutes <= DUE_SOON_MINUTES;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
        soon ? 'bg-orange-600 text-white' : 'bg-amber-100 text-amber-900 ring-1 ring-amber-300'
      } ${className}`}
    >
      <Clock size={13} /> {scheduleLabel(at)}
      {soon ? ` · ${dueText(minutes)}` : ''}
    </span>
  );
}

/** The large version for an open order: when it is for and when to start. */
export function ScheduledBanner({ at }) {
  useTick();
  if (!at) return null;
  const minutes = minutesUntil(at);
  const soon = minutes <= DUE_SOON_MINUTES;
  const start = new Date(Date.parse(at) - PREP_MINUTES * 60_000).toISOString();
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-2xl p-3 ${
        soon ? 'bg-orange-600 text-white' : 'border border-amber-300 bg-amber-50 text-amber-950'
      }`}
    >
      <Clock size={22} className="mt-0.5 shrink-0" />
      <div>
        <p className="font-bold">Scheduled for {scheduleLabel(at)}</p>
        <p className="text-sm">
          {soon ? `${dueText(minutes)[0].toUpperCase()}${dueText(minutes).slice(1)}. ` : ''}
          Start preparing around {manilaClock(start)}.
        </p>
      </div>
    </div>
  );
}

export function StatusBadge({ status }) {
  const s = STATUS[status] ?? { label: status, tone: 'gray' };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function PaymentBadge({ status }) {
  const s = PAYMENT[status] ?? { label: status, tone: 'gray' };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function MethodLabel({ order }) {
  return (
    <span className="text-xs font-medium text-ink-soft">
      {FULFILLMENT[order.fulfillment_type] ?? order.fulfillment_type} ·{' '}
      {order.payment_method === 'gcash' ? 'GCash' : 'Cash'}
      {order.channel ? ` · ${CHANNEL[order.channel] ?? order.channel}` : ''}
    </span>
  );
}

export function OrderLines({ items = [] }) {
  return (
    <ul className="divide-y divide-ink/5">
      {items.map((i) => (
        <li key={i.id} className="flex items-start justify-between gap-3 py-2 text-sm">
          <div>
            <span className="font-semibold">
              {i.quantity}× {lineLabel(i)}
            </span>
            {i.notes && <p className="text-xs text-ink-soft">“{i.notes}”</p>}
          </div>
          <span className="shrink-0 font-medium">{money(i.unit_price * i.quantity)}</span>
        </li>
      ))}
    </ul>
  );
}

export function addressLine(a) {
  if (!a) return '';
  return [a.line1, a.barangay, a.city].filter(Boolean).join(', ');
}

/** A pin the customer dropped on the map, if any. Orders placed before maps existed have none. */
export const pinOf = (a) =>
  typeof a?.latitude === 'number' && typeof a?.longitude === 'number' ? { lat: a.latitude, lng: a.longitude } : null;

/**
 * "Open in Maps" for a delivery address with a pin: directions on the rider's phone,
 * no API key needed. Renders nothing when the customer only typed the address.
 */
export function MapLink({ address, label = 'Open in Maps', className = '' }) {
  const pin = pinOf(address);
  if (!pin) return null;
  const href = `https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 font-semibold text-brand hover:underline ${className}`}
    >
      {label} ↗
    </a>
  );
}
