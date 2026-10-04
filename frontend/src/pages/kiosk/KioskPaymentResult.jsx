import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { kioskApi } from '../../lib/kiosk.js';
import { money } from '../../lib/format.js';
import { Button, Spinner } from '../../components/ui.jsx';
import { Check, X } from '../../components/icons.jsx';

/** GCash returns here; poll the kiosk-scoped order until the webhook settles it. */
export default function KioskPaymentResult({ onLocked }) {
  const [params] = useSearchParams();
  const orderId = params.get('order');
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const tries = useRef(0);

  useEffect(() => {
    if (!orderId) return undefined;
    let stop = false;
    let timer = null;
    tries.current = 0;
    const tick = async () => {
      try {
        const { data } = await kioskApi.call('get', `/kiosk/orders/${orderId}`, undefined, onLocked);
        if (stop) return;
        setOrder(data);
        if (['paid', 'failed'].includes(data.payment_status)) return;
      } catch (err) {
        if (err.status === 401 || err.status === 403) return;
      }
      if (stop) return;
      tries.current += 1;
      if (tries.current > 60) setGaveUp(true);
      else timer = setTimeout(tick, 2000);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [orderId, onLocked]);

  // Auto-return to the start screen once the outcome has been shown. A failed or
  // given-up payment used to stay on screen forever, with "Try GCash again" there
  // for the next person to walk up to. Failures get longer to read.
  const outcome = order?.payment_status === 'paid' ? 'paid' : order?.payment_status === 'failed' || gaveUp ? 'problem' : null;
  useEffect(() => {
    if (!outcome) return undefined;
    const t = setTimeout(() => navigate('/kiosk', { replace: true }), outcome === 'paid' ? 20_000 : 45_000);
    return () => clearTimeout(t);
  }, [outcome, navigate]);

  const retry = async () => {
    setRetrying(true);
    try {
      const { data } = await kioskApi.call('post', `/kiosk/orders/${orderId}/payment`, undefined, onLocked);
      window.location.href = data.checkout_url;
    } catch {
      setRetrying(false);
    }
  };

  const paid = order?.payment_status === 'paid';
  const failed = order?.payment_status === 'failed';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-cream px-6 text-center">
      {paid ? (
        <span className="flex h-24 w-24 items-center justify-center rounded-full bg-leaf text-white">
          <Check size={56} />
        </span>
      ) : failed ? (
        <span className="flex h-24 w-24 items-center justify-center rounded-full bg-brand text-white">
          <X size={56} />
        </span>
      ) : (
        <Spinner size={72} className="text-sun" />
      )}

      <h1 className="font-display text-6xl">
        {paid ? 'Payment received!' : failed ? 'Payment failed' : gaveUp ? 'Please see the cashier' : 'Confirming payment…'}
      </h1>

      {paid && (
        <>
          <p className="text-2xl text-ink-soft">Your order number is</p>
          <p className="rounded-2xl bg-white px-14 py-6 text-8xl font-extrabold tracking-wider text-brand ring-1 ring-line">
            {order.order_number}
          </p>
          <p className="text-xl">Paid {money(order.total_amount)} · We're preparing your order.</p>
        </>
      )}
      {failed && <p className="text-xl text-ink-soft">Your GCash payment did not go through.</p>}
      {gaveUp && !paid && !failed && (
        <p className="max-w-lg text-xl text-ink-soft">
          We couldn't confirm your payment. Please tell the cashier your order number
          {order ? ` (${order.order_number})` : ''}.
        </p>
      )}

      <div className="flex gap-4">
        {failed && (
          <Button size="xl" onClick={retry} loading={retrying}>
            Try GCash again
          </Button>
        )}
        <Button size="xl" tone={paid ? 'primary' : 'outline'} onClick={() => navigate('/kiosk', { replace: true })}>
          {paid ? 'Start a new order' : 'Start over'}
        </Button>
      </div>
    </div>
  );
}
