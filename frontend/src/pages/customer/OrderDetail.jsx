import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { subscribeToOrders } from '../../lib/supabase.js';
import { dateTime, money, scheduleLabel } from '../../lib/format.js';
import { prepareImage } from '../../lib/image.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Button, Card, ErrorNote, Field, Input, PageLoader } from '../../components/ui.jsx';
import GcashAccount from '../../components/GcashAccount.jsx';
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

/**
 * Manual GCash: our QR and number, then a reference number and/or receipt
 * screenshot for the branch to check against their GCash app.
 */
function GcashPayment({ order, onSubmitted }) {
  const toast = useToast();
  const [reference, setReference] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const sent = order.gcash_payment;

  if (order.payment_status === 'processing') {
    return (
      <div className="space-y-1 rounded-2xl bg-sky-50 p-4 text-sm text-sky-900">
        <p className="font-semibold">We're checking your GCash payment</p>
        <p>
          {sent?.reference_number ? `Reference no. ${sent.reference_number}. ` : ''}
          This page updates to "Paid" once the branch confirms it.
        </p>
        {sent?.receipt_url && (
          <a href={sent.receipt_url} target="_blank" rel="noreferrer" className="font-semibold underline">
            View the receipt you sent
          </a>
        )}
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let receiptPath;
      if (file) {
        const blob = await prepareImage(file);
        const res = await api.post(`/orders/${order.id}/payment/receipt`, blob, { auth: true });
        receiptPath = res.data.receipt_path;
      }
      await api.post(
        `/orders/${order.id}/payment`,
        { reference_number: reference.trim() || undefined, receipt_path: receiptPath },
        { auth: true },
      );
      toast.success("Thanks! We'll confirm your payment shortly.");
      setReference('');
      setFile(null);
      await onSubmitted();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-line p-4">
      <h2 className="font-display text-2xl">Pay with GCash</h2>
      {order.payment_status === 'failed' && (
        <p className="rounded-xl bg-brand/10 px-3 py-2 text-sm text-brand-dark">
          We couldn't confirm your last payment
          {sent?.failure_reason ? `: ${sent.failure_reason}` : '.'} Please check and send it again.
        </p>
      )}
      <GcashAccount amount={order.total_amount} />
      <form onSubmit={submit} className="space-y-3">
        <Field label="Reference no." hint="The 13-digit number on your GCash receipt">
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            maxLength={40}
            autoComplete="off"
            placeholder="e.g. 1012 345 678901"
          />
        </Field>
        <Field label="Receipt screenshot" hint="Optional if you entered the reference no.">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full cursor-pointer text-sm file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-cream-deep file:px-4 file:py-2 file:font-semibold"
          />
        </Field>
        <ErrorNote error={error} />
        <Button type="submit" loading={busy} disabled={!reference.trim() && !file}>
          I've paid
        </Button>
      </form>
    </div>
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

  const payByGcash =
    order.payment_method === 'gcash' &&
    ['unpaid', 'failed', 'processing'].includes(order.payment_status) &&
    !['completed', 'cancelled', 'voided'].includes(order.status);
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

        {payByGcash && <GcashPayment order={order} onSubmitted={refresh} />}

        {canCancel && (
          <div className="flex flex-wrap gap-3">
            <Button tone="danger" onClick={cancel} loading={busy === 'cancel'}>
              Cancel order
            </Button>
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
