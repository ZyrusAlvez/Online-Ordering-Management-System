import { Suspense, lazy } from 'react';
import { useAuth, HOME_FOR_ROLE } from '../context/AuthContext.jsx';
import { Logo, REGION, RESTAURANT } from '../components/Logo.jsx';
import { useBranches, useSelectedBranch } from '../lib/branches.js';
import { byDistance, useUserPosition } from '../lib/geo.js';
import BranchList from '../components/BranchList.jsx';
import { Button, Spinner } from '../components/ui.jsx';
import { BottomDock, CartBar } from '../components/BottomDock.jsx';
import MenuBrowser from '../components/MenuBrowser.jsx';
import VisitorChat from '../components/chat/VisitorChat.jsx';
import { CartProvider, useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useSiteImage } from '../lib/siteImages.js';
import { Bike, ChefHat, Store, Receipt } from '../components/icons.jsx';

const STEPS = [
  { icon: ChefHat, title: 'Pick your favorites', body: 'Browse the full menu — ala carte, sets, budget meals, bilao and drinks.' },
  { icon: Receipt, title: 'Pay your way', body: 'Cash on delivery or pickup, or pay ahead with GCash.' },
  { icon: Bike, title: 'Pickup or delivery', body: 'Collect at the counter, or have a rider bring it to your door.' },
];

// Leaflet only loads when the page does, not with the rest of the app.
const BranchMap = lazy(() => import('../components/BranchMap.jsx'));

/**
 * Every branch on a map plus a list. Asks for the customer's location (once)
 * to sort by distance; "Order here" makes that branch theirs for the menu and
 * checkout below.
 */
function BranchesSection() {
  const { branches, branch, select } = useSelectedBranch();
  const { position, status } = useUserPosition();
  const list = byDistance(branches, position);

  const choose = (id) => {
    select(id);
    document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' });
  };

  if (branches.length === 0) return null;

  return (
    <section id="branches" className="mx-auto max-w-6xl scroll-mt-4 px-4 py-16">
      <h2 className="font-display text-2xl sm:text-3xl">Our branches</h2>
      <p className="mt-2 text-ink-soft">
        {position
          ? 'Sorted by distance from you. Pick the branch to order from.'
          : status === 'denied'
            ? 'Pick the branch to order from. Allow location access to see which one is nearest.'
            : 'Pick the branch to order from.'}
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <Suspense
          fallback={
            <div className="flex h-80 items-center justify-center rounded-2xl border border-line bg-white text-brand sm:h-[480px]">
              <Spinner />
            </div>
          }
        >
          <BranchMap
            className="h-80 sm:h-[480px]"
            branches={branches}
            selectedId={branch?.id}
            userPos={position}
            onSelect={choose}
          />
        </Suspense>
        <BranchList
          branches={list}
          selectedId={branch?.id}
          onSelect={choose}
          className="scroll-thin lg:max-h-[480px] lg:overflow-y-auto lg:pr-1"
        />
      </div>
    </section>
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
  const promo = useSiteImage('promo');
  const { branches } = useBranches();
  const where = branches.length > 1 ? `${branches.length} branches across ${REGION}` : REGION;
  const home = HOME_FOR_ROLE[role] ?? '/menu';

  return (
    <div className="min-h-screen bg-cream">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
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

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-8 md:grid-cols-2 md:pt-16">
        <div>
          <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-sun-dark">
            <Store size={14} /> {where}
          </p>
          <h1 className="font-script text-5xl leading-[1.1] text-ink sm:text-6xl">
            Home-style favorites, <span className="text-brand">ready</span> when you are.
          </h1>
          <p className="mt-5 max-w-md text-lg text-ink-soft">
            Order from {RESTAURANT} online for pickup or delivery: sizzling sisig, lechon kawali,
            pancit, bilao and more.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="#menu" size="lg">Order now</Button>
            <Button href="#branches" size="lg" tone="outline">Find a branch</Button>
            {!isAuthed && (
              <Button to="/login" size="lg" tone="outline">
                  Log in
                </Button>
            )}
          </div>
        </div>

        <img
          src={promo}
          alt="Plates of pancit, sisig and caldereta from 3K Kitchen"
          className="mx-auto aspect-[5/4] w-full max-w-md rounded-2xl border border-line object-cover object-bottom"
        />
      </section>

      <section className="border-y border-line bg-paper py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="font-display text-2xl sm:text-3xl">How it works</h2>
          <div className="mt-10 grid gap-10 sm:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <div key={title}>
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cream-deep text-brand">
                    <Icon size={20} />
                  </span>
                  <span className="text-sm font-medium text-ink-soft">0{i + 1}</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <BranchesSection />

      <section id="menu" className="mx-auto max-w-6xl scroll-mt-4 px-4 py-16">
        <h2 className="font-display text-2xl sm:text-3xl">Our menu</h2>
        <p className="mt-2 text-ink-soft">
          Tap a dish to add it to your order. You'll log in or sign up when you check out.
        </p>
        <div className="mt-6">
          <MenuBrowser
            stickyTop="top-0"
            onAdd={(line) => {
              cart.add(line);
              toast.success(`Added ${line.quantity}× ${line.name}`);
            }}
          />
        </div>
      </section>

      <BottomDock>
        <VisitorChat />
        <CartBar count={cart.count} total={cart.estimate} />
      </BottomDock>

      <footer className="border-t border-line px-4 pb-32 pt-10 text-center text-sm text-ink-soft">
        <p className="font-script text-2xl text-ink">{RESTAURANT}</p>
        <p>{where}</p>
        <p className="mt-2 text-xs">Riders and admins sign in with the same Log in button.</p>
      </footer>
    </div>
  );
}
