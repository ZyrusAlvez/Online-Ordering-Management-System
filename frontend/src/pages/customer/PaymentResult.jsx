import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Button, Card, Spinner } from '../../components/ui.jsx';
import { Check, X } from '../../components/icons.jsx';

/**
 * GCash sends the customer back here with ?order=<id>. The PayMongo webhook
 * marks the order paid asynchronously, so poll briefly for the outcome.
 */
export default function PaymentResult() {
  const [params] = useSearchParams();
  const orderId = params.get('order');
  const { isAuthed } = useAuth();
  const [order, setOrder] = useState(null);
  const [gaveUp, setGaveUp] = useState(false);
  const tries = useRef(0);

  useEffect(() => {
    if (!orderId || !isAuthed) return undefined;
    let stop = false;
    let timer = null;
    tries.current = 0;

    const tick = async () => {
      try {
        const { data } = await api.get(`/orders/${orderId}`, { auth: true });
        if (stop) return;
        setOrder(data);
        if (['paid', 'failed'].includes(data.payment_status)) return;
      } catch {
        // keep trying
      }
      // Leaving the page while a request was in flight must end the loop, in the
      // failure path as well as the success one.
      if (stop) return;
      tries.current += 1;
      if (tries.current > 20) setGaveUp(true);
      else timer = setTimeout(tick, 2000);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [orderId, isAuthed]);

  if (!orderId) {
    return (
      <Card className="mx-auto mt-10 max-w-md text-center">
        <p>No order to show.</p>
        <Button to="/orders" className="mt-4">My orders</Button>
      </Card>
    );
  }

  if (!isAuthed) {
    // e.g. a walk-in who paid a counter QR on their own phone has no account here.
    return (
      <Card className="mx-auto mt-10 max-w-md space-y-3 text-center">
        <h1 className="font-display text-4xl">Thank you!</h1>
        <p className="text-sm text-ink-soft">
          If your GCash payment went through, the cashier will see it in a moment. You can close
          this page.
        </p>
        <Button to="/login" state={{ from: `/orders/${orderId}` }} tone="outline">Log in to view your order</Button>
      </Card>
    );
  }

  const paid = order?.payment_status === 'paid';
  const failed = order?.payment_status === 'failed';

  return (
    <Card className="mx-auto mt-10 max-w-md space-y-4 text-center">
      {paid ? (
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-leaf text-white">
          <Check size={34} />
        </span>
      ) : failed ? (
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand text-white">
          <X size={34} />
        </span>
      ) : (
        <Spinner size={48} className="mx-auto text-sun" />
      )}
      <h1 className="font-display text-4xl">
        {paid ? 'Payment received!' : failed ? 'Payment failed' : gaveUp ? 'Still processing' : 'Confirming payment…'}
      </h1>
      <p className="text-sm text-ink-soft">
        {paid && `Thank you! Order ${order.order_number} is on its way to the kitchen.`}
        {failed && 'Your GCash payment did not go through. You can try again from your order page.'}
        {!paid && !failed && (gaveUp
          ? "We haven't heard back from GCash yet. Check your order page in a moment."
          : 'This usually takes a few seconds.')}
      </p>
      <Button to={`/orders/${orderId}`}>{failed ? 'Try again' : 'View my order'}</Button>
    </Card>
  );
}
