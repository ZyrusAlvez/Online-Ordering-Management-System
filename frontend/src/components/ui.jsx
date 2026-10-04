import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { X } from './icons.jsx';

const cx = (...parts) => parts.filter(Boolean).join(' ');

const BUTTON_TONES = {
  primary: 'bg-brand text-white hover:bg-brand-dark',
  sun: 'bg-ink/5 text-ink hover:bg-ink/10',
  dark: 'bg-ink text-white hover:bg-black',
  ghost: 'bg-transparent text-ink hover:bg-cream-deep',
  outline: 'border border-line bg-paper text-ink hover:border-ink/30',
  danger: 'bg-white text-brand border border-brand/30 hover:bg-brand hover:text-white',
  green: 'bg-leaf text-white hover:bg-[#245530]',
};
const BUTTON_SIZES = {
  sm: 'px-3 py-1.5 text-sm rounded-xl',
  md: 'px-5 py-2.5 text-sm rounded-2xl',
  lg: 'px-6 py-3.5 text-base rounded-2xl',
  xl: 'px-8 py-5 text-xl rounded-3xl',
};

/**
 * A button. Give it `to` (an in-app route) or `href` (an external or in-page link)
 * and it renders the matching <Link>/<a> with the same look. Wrapping a <button>
 * in a link is invalid HTML and gives keyboard users two tab stops per control.
 */
export function Button({
  tone = 'primary',
  size = 'md',
  loading = false,
  className = '',
  children,
  disabled,
  to,
  href,
  ...rest
}) {
  const classes = cx(
    'inline-flex items-center justify-center gap-2 font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
    BUTTON_TONES[tone],
    BUTTON_SIZES[size],
    className,
  );

  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loading && <Spinner size={16} />}
      {children}
    </button>
  );
}

export function Card({ className = '', children, ...rest }) {
  return (
    <div
      className={cx('rounded-2xl border border-line bg-paper p-5', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

const BADGE_TONES = {
  amber: 'bg-amber-100 text-amber-800',
  blue: 'bg-sky-100 text-sky-800',
  orange: 'bg-sun/25 text-[#9a4a0c]',
  green: 'bg-leaf-soft text-leaf',
  red: 'bg-brand/10 text-brand-dark',
  gray: 'bg-ink/10 text-ink-soft',
};

export function Badge({ tone = 'gray', children, className = '' }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ size = 24, className = '' }) {
  return (
    <svg
      className={cx('animate-spin', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-ink-soft">
      <Spinner size={36} className="text-brand" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function Empty({ title, hint, action }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <p className="font-display text-2xl text-ink">{title}</p>
      {hint && <p className="max-w-sm text-sm text-ink-soft">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-2xl bg-brand/10 px-4 py-3 text-sm text-brand-dark"
    >
      <span>{error.friendly ?? error.message ?? String(error)}</span>
      {onRetry && (
        <button onClick={onRetry} className="font-semibold underline">
          Retry
        </button>
      )}
    </div>
  );
}

export function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-brand-dark">{error}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-base text-ink outline-none transition placeholder:text-ink/35 hover:border-ink/25 focus:border-brand focus:ring-2 focus:ring-brand/15';

export function Input(props) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}

export function Select({ children, ...props }) {
  return (
    <select {...props} className={cx(inputClass, props.className)}>
      {children}
    </select>
  );
}

export function Textarea(props) {
  return <textarea rows={3} {...props} className={cx(inputClass, props.className)} />;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// How many modals are open, so closing an inner one does not unlock page scrolling
// underneath an outer one that is still showing.
let openModals = 0;

export function Modal({ open, onClose, title, children, wide = false, footer }) {
  const dialog = useRef(null);
  // Callers pass a fresh onClose every render; keep it out of the effect's
  // dependencies, or focus would be reset on every keystroke inside the dialog.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused = document.activeElement;
    openModals += 1;
    document.body.style.overflow = 'hidden';

    // Move focus into the dialog, unless a field inside already took it (autoFocus).
    if (!dialog.current?.contains(document.activeElement)) {
      (dialog.current?.querySelector('input, textarea, select') ?? dialog.current?.querySelector(FOCUSABLE))?.focus();
    }

    const onKey = (e) => {
      if (e.key === 'Escape') {
        closeRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !dialog.current) return;

      // Keep Tab inside the dialog instead of wandering into the page behind it.
      const items = [...dialog.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !dialog.current.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !dialog.current.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      openModals -= 1;
      if (openModals === 0) document.body.style.overflow = '';
      // Hand focus back to whatever opened the dialog.
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-paper shadow-2xl sm:rounded-2xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-2xl text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-ink-soft hover:bg-cream-deep"
          >
            <X />
          </button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line bg-cream px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Segmented({ value, onChange, options, className = '' }) {
  return (
    <div className={cx('inline-flex rounded-xl bg-cream-deep p-1', className)} role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cx(
            'rounded-lg px-4 py-1.5 text-sm font-medium transition',
            value === o.value ? 'bg-white text-ink shadow-sm' : 'text-ink-soft hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-3 text-sm">
      <Button tone="outline" size="sm" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
        Previous
      </Button>
      <span className="text-ink-soft">
        Page {meta.page} of {meta.pages}
      </span>
      <Button
        tone="outline"
        size="sm"
        disabled={meta.page >= meta.pages}
        onClick={() => onPage(meta.page + 1)}
      >
        Next
      </Button>
    </div>
  );
}
