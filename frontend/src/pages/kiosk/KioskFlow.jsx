import { useCallback, useEffect, useRef, useState } from 'react';
import MenuBrowser from '../../components/MenuBrowser.jsx';
import { Logo, RESTAURANT } from '../../components/Logo.jsx';
import { Button, ErrorNote, Input } from '../../components/ui.jsx';
import { Cart, Check, ChefHat, Minus, Plus, Store, Trash } from '../../components/icons.jsx';
import { useCart } from '../../context/CartContext.jsx';
import { useSiteImage } from '../../lib/siteImages.js';
import { kioskApi } from '../../lib/kiosk.js';
import { FULFILLMENT, money } from '../../lib/format.js';

const IDLE_MS = 3 * 60_000;
const DONE_RESET_MS = 20_000;

/** Tapping the logo 5 times within 4s offers to lock the kiosk (staff only, undiscoverable by customers). */
function useSecretLock(onLock) {
  const taps = useRef([]);
  return () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 4000), now];
    if (taps.current.length >= 5) {
      taps.current = [];
      if (window.confirm('Lock this kiosk? The employee password will be needed to use it again.')) {
        onLock();
      }
    }
  };
}

function Attract({ branchName, onStart, onSecretTap }) {
  const logo = useSiteImage('logo');
  return (
    <button
      onClick={onStart}
      className="relative flex min-h-screen w-full flex-col items-center justify-center gap-8 overflow-hidden bg-cream px-6 text-center"
    >
      <img
        src={logo}
        alt=""
        onClick={(e) => {
          e.stopPropagation();
          onSecretTap();
        }}
        className="relative h-48 w-48 rounded-full object-cover ring-1 ring-line"
      />
      <div className="relative">
        <h1 className="font-script text-7xl text-ink">{RESTAURANT}</h1>
        {branchName && (
          <p className="mt-2 text-lg font-medium uppercase tracking-[0.3em] text-sun-dark">{branchName} Branch</p>
        )}
      </div>
      <span className="relative animate-pulse rounded-2xl bg-brand px-14 py-6 text-3xl font-semibold text-white">
        Touch to order
      </span>
    </button>
  );
}

function ChooseType({ onPick, onBack }) {
  const options = [
    { value: 'dine_in', label: 'Dine in', hint: 'Eat here at the terminal', icon: Store },
    { value: 'take_out', label: 'Take out', hint: 'Pack it to go', icon: ChefHat },
  ];
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-10 bg-cream px-6">
      <h1 className="text-center font-display text-6xl">
        Dine in or take out?
      </h1>
      <div className="grid w-full max-w-4xl gap-6 sm:grid-cols-2">
        {options.map(({ value, label, hint, icon: Icon }) => (
          <button
            key={value}
            onClick={() => onPick(value)}
            className="flex flex-col items-center gap-4 rounded-3xl border-2 border-line bg-white p-12 transition hover:border-brand active:scale-[0.98]"
          >
            <span className="rounded-full bg-sun/30 p-6 text-brand">
              <Icon size={72} />
            </span>
            <span className="font-display text-5xl">{label}</span>
            <span className="text-lg text-ink-soft">{hint}</span>
          </button>
        ))}
      </div>
      <Button tone="ghost" size="lg" onClick={onBack}>
        ← Start over
      </Button>
    </div>
  );
}

function CartPanel({ type, onReview, onCancel }) {
  const cart = useCart();
  return (
    <aside className="flex h-full w-full flex-col bg-paper shadow-[-8px_0_24px_rgba(43,24,18,0.08)] lg:w-[420px]">
      <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
        <div>
          <h2 className="font-display text-3xl">Your order</h2>
          <p className="text-sm font-semibold text-sun-dark">{FULFILLMENT[type]}</p>
        </div>
        <Cart size={28} className="text-brand" />
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto px-5">
        {cart.items.length === 0 ? (
          <p className="py-16 text-center text-lg text-ink-soft">Tap a dish to add it.</p>
        ) : (
          <ul className="divide-y divide-ink/5">
            {cart.items.map((i) => (
              <li key={i.key} className="py-4">
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold leading-tight">
                      {i.name}
                      {i.variantLabel ? ` (${i.variantLabel})` : ''}
                    </p>
                    {i.notes && <p className="text-sm text-ink-soft">“{i.notes}”</p>}
                  </div>
                  <span className="text-lg font-bold">{money(i.unitPrice * i.quantity)}</span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    aria-label="Decrease"
                    className="rounded-full bg-cream-deep p-3"
                    onClick={() => cart.setQuantity(i.key, i.quantity - 1)}
                  >
                    {i.quantity === 1 ? <Trash size={22} /> : <Minus size={22} />}
                  </button>
                  <span className="w-8 text-center text-xl font-bold">{i.quantity}</span>
                  <button
                    aria-label="Increase"
                    className="rounded-full bg-cream-deep p-3"
                    onClick={() => cart.setQuantity(i.key, i.quantity + 1)}
                  >
                    <Plus size={22} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 border-t border-ink/10 p-5">
        <div className="flex items-center justify-between text-2xl font-bold">
          <span>Total</span>
          <span className="text-brand">{money(cart.estimate)}</span>
        </div>
        <Button size="xl" className="w-full" disabled={cart.count === 0} onClick={onReview}>
          Review order
        </Button>
        <Button tone="ghost" size="lg" className="w-full" onClick={onCancel}>
          Cancel order
        </Button>
      </div>
    </aside>
  );
}

function Review({ type, onBack, onPlaced, onLocked }) {
  const cart = useCart();
  const [name, setName] = useState('');
  const [method, setMethod] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Back from the GCash page can restore this screen frozen mid-submit, with every
  // button disabled until the idle timer resets the kiosk three minutes later.
  useEffect(() => {
    const onShow = (e) => e.persisted && setBusy(false);
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  const place = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await kioskApi.call(
        'post',
        '/kiosk/orders',
        {
          fulfillment_type: type,
          customer_name: name.trim(),
          payment_method: method,
          items: cart.toOrderItems(),
        },
        onLocked,
      );
      if (method === 'gcash') {
        // The kiosk's return URL brings the customer back to /kiosk/payment-result.
        window.location.href = data.payment.checkout_url;
        return;
      }
      cart.clear();
      onPlaced(data.order);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  const choice = (value, title, hint) => (
    <button
      type="button"
      onClick={() => setMethod(value)}
      className={`flex-1 rounded-2xl border-2 p-6 text-left transition ${
        method === value ? 'border-brand bg-brand/5' : 'border-transparent bg-white hover:border-sun'
      }`}
    >
      <p className="font-display text-4xl">{title}</p>
      <p className="mt-1 text-ink-soft">{hint}</p>
    </button>
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-10">
      <h1 className="text-center font-display text-5xl">
        Almost there!
      </h1>

      <div className="rounded-2xl border border-line bg-paper p-6">
        <ul className="divide-y divide-ink/5">
          {cart.items.map((i) => (
            <li key={i.key} className="flex justify-between py-2 text-lg">
              <span>
                {i.quantity}× {i.name}
                {i.variantLabel ? ` (${i.variantLabel})` : ''}
              </span>
              <span className="font-semibold">{money(i.unitPrice * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-ink/10 pt-3 text-2xl font-bold">
          <span>
            Total · {FULFILLMENT[type]}
          </span>
          <span className="text-brand">{money(cart.estimate)}</span>
        </div>
      </div>

      <label className="block">
        <span className="mb-2 block text-xl font-bold">Your name</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          autoComplete="off"
          placeholder="So we can call your order"
          className="!rounded-3xl !py-5 !text-2xl"
        />
      </label>

      <div>
        <span className="mb-2 block text-xl font-bold">How will you pay?</span>
        <div className="flex flex-col gap-4 sm:flex-row">
          {choice('cash', 'Cash', 'Pay at the counter')}
          {choice('gcash', 'GCash', 'Pay now with your phone')}
        </div>
      </div>

      <ErrorNote error={error} />

      <div className="flex gap-4">
        <Button tone="outline" size="xl" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button
          size="xl"
          className="flex-1"
          disabled={!name.trim() || !method}
          loading={busy}
          onClick={place}
        >
          {method === 'gcash' ? 'Place order & pay' : 'Place order'}
        </Button>
      </div>
    </div>
  );
}

function Done({ order, onNew }) {
  const [left, setLeft] = useState(DONE_RESET_MS / 1000);

  useEffect(() => {
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left <= 0) onNew();
  }, [left, onNew]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-cream px-6 text-center">
      <span className="flex h-24 w-24 items-center justify-center rounded-full bg-leaf text-white">
        <Check size={56} />
      </span>
      <h1 className="font-display text-6xl">Thank you!</h1>
      <p className="text-2xl text-ink-soft">Your order number is</p>
      <p className="rounded-2xl bg-white px-14 py-6 text-8xl font-extrabold tracking-wider text-brand ring-1 ring-line">
        {order.order_number}
      </p>
      <p className="max-w-xl text-2xl">
        Please pay <strong>{money(order.total_amount)}</strong> at the counter and tell the cashier
        your name or order number.
      </p>
      <Button size="xl" onClick={onNew}>
        Start a new order
      </Button>
      <p className="text-sm text-ink-soft">Returning to the start screen in {Math.max(left, 0)}s</p>
    </div>
  );
}

export default function KioskFlow({ onLock }) {
  const cart = useCart();
  const [step, setStep] = useState('attract');
  const [type, setType] = useState(null);
  const [placed, setPlaced] = useState(null);
  const secretTap = useSecretLock(onLock);

  // Which branch this device orders for, shown on the attract screen.
  const [device, setDevice] = useState(null);
  useEffect(() => {
    kioskApi.call('get', '/kiosk/me', undefined, onLock).then((res) => setDevice(res.data), () => {});
  }, [onLock]);

  const reset = useCallback(() => {
    cart.clear();
    setType(null);
    setPlaced(null);
    setStep('attract');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Walk-away protection: abandon an untouched order after a few idle minutes.
  const idle = useRef();
  useEffect(() => {
    if (['attract', 'done'].includes(step)) return undefined;
    const arm = () => {
      clearTimeout(idle.current);
      idle.current = setTimeout(reset, IDLE_MS);
    };
    arm();
    const events = ['pointerdown', 'keydown', 'scroll'];
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    return () => {
      clearTimeout(idle.current);
      events.forEach((e) => window.removeEventListener(e, arm));
    };
  }, [step, reset]);

  if (step === 'attract') {
    return <Attract branchName={device?.branch?.name} onStart={() => setStep('type')} onSecretTap={secretTap} />;
  }
  if (step === 'type') {
    return (
      <ChooseType
        onPick={(t) => {
          setType(t);
          setStep('menu');
        }}
        onBack={reset}
      />
    );
  }
  if (step === 'review') {
    return (
      <Review
        type={type}
        onBack={() => setStep('menu')}
        onLocked={onLock}
        onPlaced={(order) => {
          setPlaced(order);
          setStep('done');
        }}
      />
    );
  }
  if (step === 'done') return <Done order={placed} onNew={reset} />;

  return (
    <div className="flex h-screen flex-col lg:flex-row">
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-cream px-4 pb-8">
        <div className="flex items-center justify-between py-4">
          <Logo to={null} size={56} />
          <Button tone="outline" size="lg" onClick={() => setStep('type')}>
            Change: {FULFILLMENT[type]}
          </Button>
        </div>
        <MenuBrowser size="kiosk" onAdd={cart.add} />
      </div>
      <div className="h-[42vh] shrink-0 lg:h-full">
        <CartPanel type={type} onReview={() => setStep('review')} onCancel={reset} />
      </div>
    </div>
  );
}
