import { Badge } from './ui.jsx';
import { CHANNEL, FULFILLMENT, PAYMENT, STATUS, lineLabel, money } from '../lib/format.js';

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
