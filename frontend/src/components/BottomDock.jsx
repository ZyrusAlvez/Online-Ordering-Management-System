import { Link } from 'react-router-dom';
import { money } from '../lib/format.js';
import { Cart } from './icons.jsx';

/**
 * Everything that floats at the bottom of a public page (the cart bar, the chat
 * button) lives in this one stack, so they can never sit on top of each other
 * whatever their height: they are laid out in a column, not each pinned to its
 * own spot. Toasts appear at the top of the screen for the same reason.
 *
 * The wrapper ignores pointer events so it never blocks taps beside the items;
 * each child opts back in with `pointer-events-auto`.
 */
export function BottomDock({ children }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-end gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {children}
    </div>
  );
}

/** "Checkout · 3 items · ₱440.00". Shown only once something is in the cart. */
export function CartBar({ count, total, to = '/checkout', label = 'Checkout' }) {
  if (!count) return null;
  return (
    <Link
      to={to}
      className="pointer-events-auto flex w-full max-w-xl items-center justify-between gap-3 self-center rounded-2xl bg-brand px-5 py-3.5 text-white shadow-lg transition hover:bg-brand-dark"
    >
      <span className="flex items-center gap-2 font-medium">
        <Cart size={20} /> {label} · {count} {count === 1 ? 'item' : 'items'}
      </span>
      <span className="font-semibold">{money(total)}</span>
    </Link>
  );
}
