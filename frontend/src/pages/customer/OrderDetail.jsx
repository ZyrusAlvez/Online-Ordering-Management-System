import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { subscribeToOrders } from '../../lib/supabase.js';
import { dateTime, money, scheduleLabel } from '../../lib/format.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Button, Card, ErrorNote, PageLoader } from '../../components/ui.jsx';
import {
  MethodLabel,
  OrderLines,
  PaymentBadge,
  StatusBadge,
  MapLink,
  addressLine,
} from '../../components/OrderParts.jsx';
import DeliveryChat from '../../components/chat/DeliveryChat.jsx';
import { Check } from '../../components/icons.jsx';

const STEPS = {
  delivery: ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed'],
  pickup: ['pending', 'confirmed', 'preparing', 'ready', 'completed'],
};
const STEP_LABEL = {
  pending: 'Received',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'On the way',
  completed: 'Done',
};

function Timeline({ order }) {
  const steps = STEPS[order.fulfillment_type] ?? STEPS.pickup;
  if (['cancelled', 'voided'].includes(order.status)) return null;
  const at = steps.indexOf(order.status);

  return (
    <ol className="flex items-center justify-between gap-1">
      {steps.map((s, i) => (
        <li key={s} className="flex flex-1 flex-col items-center gap-1 text-center">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
              i < at
                ? 'bg-leaf text-white'
                : i === at
                  ? 'bg-brand text-white ring-4 ring-brand/15'
                  : 'bg-ink/10 text-ink-soft'
            }`}
          >
            {i < at ? <Check size={16} /> : i + 1}
          </span>
          <span className={`text-[11px] font-semibold ${i === at ? 'text-brand' : 'text-ink-soft'}`}>
            {STEP_LABEL[s]}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { data, error, loading, reload, refresh } = useFetch(
    () => api.get(`/orders/${id}`, { auth: true }),
    [id],
  );
  const [busy, setBusy] = useState(null);

  useEffect(
    () =>
      subscribeToOrders((payload) => {
        if (payload.new?.id === id) refresh();
      }),
    [id, refresh],
  );

  const order = data?.data;

  const payWithGcash = async () => {
    setBusy('pay');
    try {
      const res = await api.post(`/orders/${id}/payment`, undefined, { auth: true });
      window.location.href = res.data.checkout_url;
    } catch (err) {
      toast.error(err.friendly);
      setBusy(null);
    }
  };

  const cancel = async () => {
    if (!window.confirm('Cancel this order?')) return;
    setBusy('cancel');
    try {
      await api.post(`/orders/${id}/cancel`, undefined, { auth: true });
      toast.success('Order cancelled');
      await refresh();
    } catch (err) {
      toast.error(err.friendly);
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <PageLoader />;
  if (error) {
    return (
      <div className="mx-auto mt-6 max-w-xl space-y-3">
        <ErrorNote error={error} onRetry={reload} />
        <Link to="/orders" className="text-sm font-semibold text-brand">
          ← All orders
        </Link>
      </div>
    );
  }

  const canPay =
    order.payment_method === 'gcash' &&
    ['unpaid', 'failed', 'processing'].includes(order.payment_status) &&
    ['pending', 'confirmed'].includes(order.status);
  const canCancel =
    ['pending', 'confirmed'].includes(order.status) && order.payment_status === 'unpaid';

  return (
    <div className="mx-auto mt-2 max-w-2xl space-y-4">
      <Link to="/orders" className="text-sm font-semibold text-brand">
        ← All orders
      </Link>

      <Card className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-4xl">{order.order_number}</h1>
            <p className="text-xs text-ink-soft">
              Placed {dateTime(order.created_at)}
              {order.branch?.name ? ` · ${order.branch.name} branch` : ''}
            </p>
            {order.scheduled_for && (
              <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                Scheduled for {scheduleLabel(order.scheduled_for)}
              </p>
            )}
            <MethodLabel order={order} />
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge status={order.status} />
            <PaymentBadge status={order.payment_status} />
          </div>
        </div>

        <Timeline order={order} />

        {order.fulfillment_type === 'delivery' && order.delivery_address && (
          <div className="rounded-2xl bg-cream-deep/60 p-4 text-sm">
            <p className="font-semibold">Delivering to</p>
            <p>{addressLine(order.delivery_address)}</p>
            {order.delivery_address.landmark && (
              <p className="text-ink-soft">Near {order.delivery_address.landmark}</p>
            )}
            <MapLink address={order.delivery_address} label="View pinned location" className="mt-1" />
          </div>
        )}

        <OrderLines items={order.order_items} />

        <div className="flex items-center justify-between border-t border-ink/10 pt-3 text-xl font-bold">
          <span>Total</span>
          <span className="text-brand">{money(order.total_amount)}</span>
        </div>

        {order.notes && <p className="text-sm text-ink-soft">Your note: “{order.notes}”</p>}

        {(canPay || canCancel) && (
          <div className="flex flex-wrap gap-3">
            {canPay && (
              <Button onClick={payWithGcash} loading={busy === 'pay'}>
                Pay with GCash
              </Button>
            )}
            {canCancel && (
              <Button tone="danger" onClick={cancel} loading={busy === 'cancel'}>
                Cancel order
              </Button>
            )}
          </div>
        )}
      </Card>

      {order.fulfillment_type === 'delivery' && order.rider_id && (
        <Card className="space-y-2">
          <h2 className="font-display text-2xl">Chat with your rider</h2>
          <DeliveryChat orderId={id} as="customer" orderKey={`${order.status}:${order.rider_id}`} />
        </Card>
      )}
      {order.fulfillment_type === 'delivery' &&
        !order.rider_id &&
        !['completed', 'cancelled', 'voided'].includes(order.status) && (
          <p className="px-2 text-center text-sm text-ink-soft">
            You'll be able to chat with your rider once they pick up your order.
          </p>
        )}
    </div>
  );
}
