import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { CartProvider, useCart } from '../context/CartContext.jsx';
import Avatar from './Avatar.jsx';
import { Logo } from './Logo.jsx';
import { Button } from './ui.jsx';
import { Cart, Logout } from './icons.jsx';

function CartButton() {
  const { count } = useCart();
  return (
    <Link
      to="/checkout"
      aria-label={`Cart, ${count} items`}
      className="relative rounded-full bg-white p-2.5 text-ink ring-1 ring-line transition hover:text-brand"
    >
      <Cart />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold text-white">
          {count}
        </span>
      )}
    </Link>
  );
}

/** Avatar button with My orders / Profile / Sign out. Closes on outside click and Escape. */
function AccountMenu({ onLogout }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => (e.type === 'keydown' ? e.key === 'Escape' && setOpen(false) : !box.current?.contains(e.target) && setOpen(false));
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const name = user?.user_metadata?.full_name;
  const item = 'block w-full px-4 py-2.5 text-left text-sm font-medium text-ink hover:bg-cream';

  return (
    <div ref={box} className="relative ml-1">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        className="rounded-full ring-2 ring-transparent transition hover:ring-sun focus-visible:ring-sun"
      >
        <Avatar src={user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture} name={name} email={user?.email} size={38} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-lg">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-semibold">{name || 'My account'}</p>
            <p className="truncate text-xs text-ink-soft">{user?.email}</p>
          </div>
          <Link role="menuitem" to="/orders" onClick={() => setOpen(false)} className={item}>My orders</Link>
          <Link role="menuitem" to="/profile" onClick={() => setOpen(false)} className={item}>Profile</Link>
          <button role="menuitem" onClick={onLogout} className={`${item} border-t border-line text-brand`}>Sign out</button>
        </div>
      )}
    </div>
  );
}

const navClass = ({ isActive }) =>
  `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-ink/5 text-ink' : 'text-ink-soft hover:text-ink'}`;

function CustomerHeader() {
  const { isAuthed, role, user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Logo size={40} className="shrink-0" />
        <nav className="flex items-center gap-1 sm:gap-2">
          <NavLink to="/menu" className={navClass}>
            Menu
          </NavLink>
          {isAuthed && role === 'customer' && (
            <NavLink to="/orders" className={(s) => `${navClass(s)} hidden sm:inline-flex`}>
              My orders
            </NavLink>
          )}
          <CartButton />
          {isAuthed && role === 'customer' ? (
            <AccountMenu
              onLogout={async () => {
                await logout();
                navigate('/');
              }}
            />
          ) : isAuthed ? (
            <button
              onClick={async () => {
                await logout();
                navigate('/');
              }}
              title={user?.email}
              className="ml-1 flex items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold text-ink-soft hover:text-brand"
            >
              <Logout size={18} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          ) : (
            <Button to="/login" size="sm" className="ml-1">Log in</Button>
          )}
        </nav>
      </div>
    </header>
  );
}

export function CustomerLayout() {
  return (
    <CartProvider storageKey="3k.cart">
      <CustomerHeader />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-4">
        <Outlet />
      </main>
    </CartProvider>
  );
}

/** Header bar for staff-facing screens (cashier, driver, admin). */
export function StaffBar({ title, children, onLogout }) {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <Logo to={null} size={38} text={false} />
          <div className="leading-tight">
            <p className="font-display text-lg">{title}</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-sun-dark">
              3K Kitchen · GMA Terminal
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {children}
          {user?.email && (
            <span className="hidden text-xs text-ink-soft md:inline">{user.email}</span>
          )}
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 rounded-xl bg-ink/5 px-3 py-2 text-sm font-medium text-ink transition hover:bg-ink/10"
          >
            <Logout size={16} /> <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
