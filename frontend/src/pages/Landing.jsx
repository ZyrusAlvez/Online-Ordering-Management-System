import { Suspense, lazy } from 'react';
import { useAuth, HOME_FOR_ROLE } from '../context/AuthContext.jsx';
import { Logo, REGION, RESTAURANT } from '../components/Logo.jsx';
import { useSelectedBranch } from '../lib/branches.js';
import { byDistance, formatKm, haversineKm, hoursLabel, isOpenNow, useUserPosition } from '../lib/geo.js';
import BranchList from '../components/BranchList.jsx';
import { Badge, Button, Card, Spinner } from '../components/ui.jsx';
import { BottomDock, CartBar } from '../components/BottomDock.jsx';
import MenuBrowser from '../components/MenuBrowser.jsx';
import VisitorChat from '../components/chat/VisitorChat.jsx';
import { CartProvider, useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Bike, ChefHat, Clock, Pin, Store } from '../components/icons.jsx';

// Leaflet only loads with the map, not with the rest of the app.
const BranchMap = lazy(() => import('../components/BranchMap.jsx'));

const STEPS = [
  { icon: Store, title: 'Pick your branch', body: 'The one nearest you is chosen for you, or pick any of them on the map.' },
  { icon: ChefHat, title: 'Choose your dishes', body: 'Ala carte, sets, budget meals, bilao and drinks: the same menu at every branch.' },
  { icon: Clock, title: 'Now or later', body: 'Order for right away, or schedule a time up to two days ahead.' },
  { icon: Bike, title: 'Pickup or delivery', body: 'Collect it at the counter or have a rider bring it. Pay cash or GCash.' },
];

const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

/** The customer's branch (nearest unless they picked one), up front in the hero. */
function YourBranchCard({ branch, explicit, isNearest, position, status, onOrder }) {
  if (!branch) {
    return (
      <Card className="flex items-center gap-3 text-ink-soft">
        <Spinner /> Loading branches…
      </Card>
    );
  }

  const open = isOpenNow(branch);
  const label = explicit ? 'Your branch' : isNearest ? 'Nearest to you' : 'Suggested branch';
  const km = position ? haversineKm(position, branch) : null;

  return (
    <Card className="shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sun-dark">{label}</p>
          <h2 className="mt-1 text-2xl font-bold leading-tight">{branch.name}</h2>
        </div>
        <Badge tone={open ? 'green' : 'amber'} className="shrink-0 whitespace-nowrap">
          {open ? 'Open now' : 'Closed now'}
        </Badge>
      </div>
      <p className="mt-2 text-sm text-ink-soft">
        {hoursLabel(branch)}
        {km != null && ` · ${formatKm(km)} away`}
      </p>
      {branch.address && (
        <p className="mt-1 flex items-start gap-1 text-sm text-ink-soft">
          <Pin size={15} className="mt-0.5 shrink-0" /> {branch.address}
        </p>
      )}
      {!open && <p className="mt-2 text-sm text-amber-800">Closed right now, but you can order ahead for later.</p>}
      {!explicit && status === 'asking' && <p className="mt-2 text-xs text-ink-soft">Finding the branch nearest you…</p>}
      {!explicit && status === 'denied' && (
        <p className="mt-2 text-xs text-ink-soft">Allow location access to have the nearest branch picked for you.</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={onOrder}>Order from {branch.name}</Button>
        <Button tone="ghost" onClick={() => scrollTo('branches')}>
          See all branches
        </Button>
      </div>
    </Card>
  );
}

// Same storage key as the customer layout, so a cart started here is the one
// /checkout shows. Login is only asked for there, not while browsing.
export default function Landing() {
  return (
    <CartProvider storageKey="3k.cart">
      <LandingPage />
    </CartProvider>
  );
}

function LandingPage() {
  const { isAuthed, role } = useAuth();
  const cart = useCart();
  const toast = useToast();
  const { branch, branches, explicit, isNearest, select } = useSelectedBranch({ locate: true });
  const { position, status } = useUserPosition();
  const home = HOME_FOR_ROLE[role] ?? '/menu';
  const count = branches.length;
  const nearestFirst = byDistance(branches, position);

  // Picking a branch anywhere on the page takes the customer to its menu.
  const choose = (id) => {
    select(id);
    scrollTo('menu');
  };

  return (
    <div className="min-h-screen bg-cream">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5">
        <Logo />
        <nav className="hidden items-center gap-1 text-sm font-medium text-ink-soft md:flex">
          <a href="#branches" className="rounded-lg px-3 py-1.5 hover:text-ink">Branches</a>
          <a href="#how" className="rounded-lg px-3 py-1.5 hover:text-ink">How it works</a>
          <a href="#menu" className="rounded-lg px-3 py-1.5 hover:text-ink">Menu</a>
        </nav>
        <div className="flex items-center gap-2">
          {isAuthed ? (
            <Button to={home}>Go to my page</Button>
          ) : (
            <>
              <Button to="/login" tone="ghost">Log in</Button>
              <Button to="/register" className="!hidden sm:!inline-flex">Sign up</Button>
            </>
          )}
        </div>
      </header>

      {/* Hero: the branches are the picture. */}
      <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-16 pt-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:gap-10 md:pt-8">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-paper px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-sun-dark ring-1 ring-line">
            <Store size={14} /> {count > 1 ? `${count} branches across ${REGION}` : REGION}
          </p>
          <h1 className="mt-5 font-script text-5xl leading-[1.08] text-ink sm:text-6xl">
            Home-style favorites, <span className="text-brand">near you</span>.
          </h1>
          <p className="mt-4 max-w-md text-lg text-ink-soft">
            Sizzling sisig, lechon kawali, pancit and bilao from the {RESTAURANT} branch closest to you. Pick it up, have
            it delivered, or order ahead.
          </p>
          <div className="mt-7 max-w-md">
            <YourBranchCard
              branch={branch}
              explicit={explicit}
              isNearest={isNearest}
              position={position}
              status={status}
              onOrder={() => choose(branch.id)}
            />
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-ink-soft">
            {[count > 1 ? `${count} branches` : 'Branches near you', 'Pickup & delivery', 'Order ahead', 'Cash or GCash'].map(
              (fact) => (
                <li key={fact} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" /> {fact}
                </li>
              ),
            )}
          </ul>
        </div>

        <div className="relative">
          <Suspense
            fallback={
              <div className="flex h-80 items-center justify-center rounded-3xl border border-line bg-paper text-brand md:h-[540px]">
                <Spinner />
              </div>
            }
          >
            <BranchMap
              className="h-80 rounded-3xl md:h-[540px]"
              branches={branches}
              selectedId={branch?.id}
              userPos={position}
              onSelect={choose}
            />
          </Suspense>
        </div>
      </section>

      <section id="branches" className="scroll-mt-4 border-y border-line bg-paper py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="font-display text-2xl sm:text-3xl">Find us in {REGION}</h2>
          <p className="mt-2 text-ink-soft">
            {position
              ? 'Sorted by distance from you. Every branch serves the same menu at the same prices.'
              : 'Every branch serves the same menu at the same prices. Pick the one to order from.'}
          </p>
          <BranchList layout="grid" branches={nearestFirst} selectedId={branch?.id} onSelect={choose} className="mt-8" />
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl scroll-mt-4 px-4 py-16">
        <h2 className="font-display text-2xl sm:text-3xl">How it works</h2>
        <ol className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title}>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cream-deep text-brand">
                  <Icon size={20} />
                </span>
                <span className="text-sm font-medium text-ink-soft">0{i + 1}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="menu" className="scroll-mt-4 border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="font-display text-2xl sm:text-3xl">Our menu</h2>
          <p className="mt-2 text-ink-soft">
            Tap a dish to add it to your order. You'll log in or sign up when you check out.
          </p>
          {branch && (
            <p className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-full bg-cream-deep px-3 py-1.5 text-sm">
              <Store size={15} /> Ordering from <strong>{branch.name}</strong>
              <a href="#branches" className="font-semibold text-brand hover:underline">Change</a>
            </p>
          )}
          <div className="mt-6">
            <MenuBrowser
              branchId={branch?.id}
              stickyTop="top-0"
              onAdd={(line) => {
                cart.add(line);
                toast.success(`Added ${line.quantity}× ${line.name}`);
              }}
            />
          </div>
        </div>
      </section>

      <BottomDock>
        <VisitorChat />
        <CartBar count={cart.count} total={cart.estimate} />
      </BottomDock>

      <footer className="border-t border-line bg-paper px-4 pb-32 pt-12">
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div>
            <Logo to={null} />
            <p className="mt-3 max-w-xs text-sm text-ink-soft">
              Home-style Filipino favorites{count > 1 ? ` at ${count} branches` : ''} across {REGION}.
            </p>
            <p className="mt-3 text-xs text-ink-soft">Cashiers, riders and admins sign in with the same Log in button.</p>
          </div>
          <ul className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {branches.map((b) => {
              const open = isOpenNow(b);
              return (
                <li key={b.id}>
                  <button type="button" onClick={() => choose(b.id)} className="text-left font-semibold hover:text-brand">
                    {b.name}
                  </button>
                  <p className="text-xs text-ink-soft">
                    {hoursLabel(b)} ·{' '}
                    <span className={open ? 'text-leaf' : 'text-amber-700'}>{open ? 'Open now' : 'Closed'}</span>
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </footer>
    </div>
  );
}
