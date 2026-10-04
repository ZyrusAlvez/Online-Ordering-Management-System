const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
export const money = (n) => peso.format(Number(n ?? 0));

export const timeAgo = (iso) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
};

export const dateTime = (iso) =>
  new Date(iso).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

// tone -> Badge colour (see components/ui.jsx)
export const STATUS = {
  pending: { label: 'Pending', tone: 'amber' },
  confirmed: { label: 'Confirmed', tone: 'blue' },
  preparing: { label: 'Preparing', tone: 'orange' },
  ready: { label: 'Ready', tone: 'green' },
  out_for_delivery: { label: 'Out for delivery', tone: 'blue' },
  completed: { label: 'Completed', tone: 'gray' },
  cancelled: { label: 'Cancelled', tone: 'red' },
  voided: { label: 'Voided', tone: 'red' },
};

export const PAYMENT = {
  unpaid: { label: 'Unpaid', tone: 'amber' },
  processing: { label: 'Processing', tone: 'blue' },
  paid: { label: 'Paid', tone: 'green' },
  refund_pending: { label: 'Refund pending', tone: 'amber' },
  refunded: { label: 'Refunded', tone: 'gray' },
  refund_failed: { label: 'Refund failed', tone: 'red' },
  failed: { label: 'Payment failed', tone: 'red' },
};

export const FULFILLMENT = {
  dine_in: 'Dine in',
  take_out: 'Take out',
  delivery: 'Delivery',
  pickup: 'Pickup',
};

export const CHANNEL = { kiosk: 'Kiosk', pos: 'Counter', online: 'Online' };

/** Mirrors the backend's legal POS transitions so buttons only offer valid moves. */
export const NEXT_STATUS = {
  pending: { to: 'confirmed', label: 'Confirm' },
  confirmed: { to: 'preparing', label: 'Start preparing' },
  preparing: { to: 'ready', label: 'Mark ready' },
  ready: { to: 'completed', label: 'Complete' },
  out_for_delivery: { to: 'completed', label: 'Complete' },
};

export const lineLabel = (item) =>
  [item.product?.name, item.variant?.label && `(${item.variant.label})`].filter(Boolean).join(' ');

// --- Manila calendar days -----------------------------------------------------
// Sales are reported by the restaurant's day (Asia/Manila, UTC+8 all year), not the
// browser's, so a phone set to another timezone still sees the same "today".
// Days are plain 'YYYY-MM-DD' strings, the same shape the API takes.

export const manilaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

export const addDays = (day, n) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export const startOfMonth = (day) => `${day.slice(0, 7)}-01`;

/** "Oct 4" (or "Oct 4, 2025" when `withYear`) for a 'YYYY-MM-DD' day. */
export const shortDay = (day, withYear = false) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
