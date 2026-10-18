'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { call, respond } from '@/utils/apiError';
import { advanceStatus, createWalkInOrder, listStaffOrders, mustPayFirst, replaceItems } from '@/controllers/orderController';
import { getOrderWithPayment, payCash, payGcashAtCounter, verifyGcash, voidOrder } from '@/controllers/paymentController';
import { useInbox } from '@/hooks/useChat';
import { useGcashAccount } from '@/hooks/useGcash';
import { useDebounced, useFetch, useTick } from '@/hooks/hooks';
import { subscribeToOrders } from '@/hooks/realtime';
import {
  CHANNEL,
  FULFILLMENT,
  NEXT_STATUS,
  STATUS,
  minutesUntil,
  money,
  timeAgo,
} from '@/utils/format';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { StaffBar } from '@/view/components/Layouts';
import { BranchPicker, StaffBranchProvider, useStaffBranch } from '@/view/components/StaffBranch';
import StaffInbox from '@/view/components/chat/StaffInbox';
import ItemsEditor, { linesFromOrder } from '@/view/components/ItemsEditor';
import GcashAccount from '@/view/components/GcashAccount';
import {
  DUE_SOON_MINUTES,
  MapLink,
  MethodLabel,
  OrderLines,
  PaymentBadge,
  ScheduledBadge,
  ScheduledBanner,
  StatusBadge,
  addressLine,
} from '@/view/components/OrderParts';
import {
  ActionMenu,
  Skeleton,
  Button,
  Empty,
  ErrorNote,
  Field,
  Input,
  Modal,
  Segmented,
  Select,
  Textarea,
} from '@/view/components/ui';
import { OrderPanelSkeleton, QueueSkeleton } from '@/view/presentation/cashier/SkeletonLoading';
import { Chat, Plus, Search } from '@/view/components/icons';

const ACTIVE = ['pending', 'preparing', 'ready', 'out_for_delivery'];
const TABS = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Done' },
  { value: 'closed', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

const useMedia = (query) => {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
};

/** When an order should be worked on: its slot if scheduled, else when it came in. */
const dueAt = (o) => o.scheduled_for ?? o.created_at;

// A scheduled order still waiting on the kitchen gets a coloured edge: amber,
// then orange once it is close, so it is neither started too early nor missed.
const scheduleEdge = (order) => {
  if (!order.scheduled_for || order.status !== 'pending') return '';
  return minutesUntil(order.scheduled_for) <= DUE_SOON_MINUTES ? 'border-l-4 border-l-orange-600' : 'border-l-4 border-l-amber-400';
};

function QueueRow({ order, selected, onSelect }: any) {
  useTick(); // the edge turns orange as the slot comes due
  return (
    <button
      onClick={() => onSelect(order.id)}
      className={`w-full rounded-xl border p-3 text-left transition ${
        selected ? 'border-brand bg-brand/5' : 'border-line bg-paper hover:border-ink/25'
      } ${scheduleEdge(order)}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-extrabold leading-none">{order.order_number}</p>
          <p className="mt-1 text-sm font-medium">{order.customer_name || 'Guest'}</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-brand">{money(order.total_amount)}</p>
          <p className="text-xs text-ink-soft">{timeAgo(order.created_at)}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <ScheduledBadge at={order.scheduled_for} />
        <StatusBadge status={order.status} />
        <PaymentBadge status={order.payment_status} />
        <span className="text-xs text-ink-soft">
          {CHANNEL[order.channel]} · {FULFILLMENT[order.fulfillment_type]}
        </span>
      </div>
    </button>
  );
}

/**
 * Take payment: one window for both ways a customer pays at the counter, opening on the method
 * they chose (Cash or GCash). GCash is left out when the restaurant's GCash is switched off.
 */
function PaymentModal({ order, onClose, onPaid }: any) {
  const gcashOn = Boolean(useGcashAccount());
  const [method, setMethod] = useState(gcashOn && order.payment_method === 'gcash' ? 'gcash' : 'cash');
  const [paidCash, setPaidCash] = useState(null);

  if (paidCash) {
    return (
      <Modal open onClose={onClose} title="Payment received">
        <div className="space-y-4 text-center">
          <p className="text-sm text-ink-soft">Change to give back</p>
          <p className="text-6xl font-extrabold text-leaf">{money(paidCash.change)}</p>
          <p className="text-sm text-ink-soft">Tendered {money(paidCash.tendered)}</p>
          <Button size="lg" className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={`Take payment · ${order.order_number}`}>
      <div className="space-y-5">
        {gcashOn && (
          <Segmented
            value={method}
            onChange={setMethod}
            className="w-full [&>button]:flex-1"
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'gcash', label: 'GCash' },
            ]}
          />
        )}
        {method === 'cash' ? (
          <CashPanel order={order} onPaid={(res) => { setPaidCash(res); onPaid(); }} />
        ) : (
          <GcashPanel order={order} onPaid={() => { onPaid(); onClose(); }} />
        )}
      </div>
    </Modal>
  );
}

function CashPanel({ order, onPaid }: any) {
  const toast = useToast();
  const [tendered, setTendered] = useState(String(order.total_amount));
  const [busy, setBusy] = useState(false);

  const amount = Number(tendered);
  const change = Math.max(0, amount - Number(order.total_amount));
  const short = amount < Number(order.total_amount);
  const quick = [...new Set([Number(order.total_amount), 100, 200, 500, 1000])].filter(
    (n) => n >= Number(order.total_amount),
  );

  const pay = async () => {
    setBusy(true);
    try {
      onPaid(await call(payCash(order.id, { tendered_amount: amount })));
    } catch (err) {
      toast.error(err.friendly);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between text-lg">
        <span>Amount due</span>
        <strong>{money(order.total_amount)}</strong>
      </div>
      <Field label="Cash tendered">
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          max="999999.99"
          step="0.01"
          autoFocus
          value={tendered}
          onChange={(e) => setTendered(e.target.value)}
          className="!text-2xl"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        {quick.map((n) => (
          <button
            key={n}
            onClick={() => setTendered(String(n))}
            className="rounded-full bg-cream-deep px-4 py-1.5 text-sm font-semibold hover:bg-sun/40"
          >
            {n === Number(order.total_amount) ? 'Exact' : money(n)}
          </button>
        ))}
      </div>
      <div className="flex justify-between rounded-2xl bg-cream-deep/60 p-3 text-lg">
        <span>Change</span>
        <strong className={short ? 'text-brand' : 'text-leaf'}>
          {short ? 'Not enough' : money(change)}
        </strong>
      </div>
      <Button size="lg" className="w-full" loading={busy} disabled={short || !tendered} onClick={pay}>
        Receive {money(order.total_amount)}
      </Button>
    </div>
  );
}

/**
 * GCash at the counter: the customer scans our QR (or already paid at the kiosk),
 * shows their receipt, and the cashier copies the reference number off it.
 */
function GcashPanel({ order, onPaid }: any) {
  const toast = useToast();
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  const pay = async () => {
    setBusy(true);
    try {
      await call(payGcashAtCounter(order.id, { reference_number: reference.trim() }));
      toast.success(`${order.order_number} paid with GCash`);
      onPaid();
    } catch (err) {
      toast.error(err.friendly);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <GcashAccount amount={order.total_amount} />
      <p className="text-center text-sm text-ink-soft">
        Check the customer's GCash receipt: our account name, the amount, and today's date.
      </p>
      <Field label="Reference no. on the receipt">
        <Input
          autoFocus
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          maxLength={40}
          autoComplete="off"
          placeholder="e.g. 1012 345 678901"
        />
      </Field>
      <Button size="lg" className="w-full" loading={busy} disabled={reference.trim().length < 6} onClick={pay}>
        Mark paid
      </Button>
    </div>
  );
}

/** An online customer's GCash reference number / receipt, waiting for staff to check it. */
function GcashReview({ order, onDone }: any) {
  const toast = useToast();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(null);
  const sent = order.gcash_payment;

  const verify = async (approve) => {
    setBusy(approve ? 'approve' : 'reject');
    try {
      await call(verifyGcash(order.id, approve ? { approve } : { approve, reason: reason.trim() }));
      toast.success(approve ? `${order.order_number} marked paid` : 'Payment rejected; the customer can resend it');
      setRejecting(false);
      setReason('');
      await onDone();
    } catch (err) {
      toast.error(err.friendly);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl bg-sky-50 p-4 text-sm text-sky-950">
      <p className="font-semibold">GCash payment to verify</p>
      <p>
        Check your GCash app for <strong>{money(order.total_amount)}</strong>
        {sent?.reference_number ? (
          <>
            {' '}with reference no. <strong className="font-mono">{sent.reference_number}</strong>
          </>
        ) : null}
        .
      </p>
      {sent?.receipt_url && (
        <a href={sent.receipt_url} target="_blank" rel="noreferrer" className="block w-fit">
          <img
            src={sent.receipt_url}
            alt="Customer's GCash receipt"
            className="max-h-64 rounded-xl ring-1 ring-sky-200"
          />
        </a>
      )}
      {rejecting ? (
        <div className="space-y-2">
          <Field label="Why? (the customer sees this)">
            <Input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder="e.g. No payment with this reference number"
            />
          </Field>
          <div className="flex gap-2">
            <Button tone="outline" onClick={() => setRejecting(false)}>
              Back
            </Button>
            <Button tone="danger" loading={busy === 'reject'} disabled={!reason.trim()} onClick={() => verify(false)}>
              Reject payment
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button tone="green" loading={busy === 'approve'} onClick={() => verify(true)}>
            Approve
          </Button>
          <Button tone="outline" onClick={() => setRejecting(true)}>
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}

function VoidModal({ order, onClose, onDone }: any) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await call(voidOrder(order.id, { reason: reason.trim() }));
      toast.success(res.refund_pending ? 'Order voided. Send the GCash refund to the customer.' : 'Order voided');
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.friendly);
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Void ${order.order_number}`}>
      <div className="space-y-4">
        {order.payment_status === 'paid' && order.payment_method === 'gcash' && (
          <p className="rounded-2xl bg-amber-100 p-3 text-sm text-amber-900">
            This order was paid by GCash. After voiding, send {money(order.total_amount)} back to the
            customer's GCash; an admin then marks the refund done.
          </p>
        )}
        <Field label="Reason">
          <Textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
        <div className="flex gap-3">
          <Button tone="outline" className="flex-1" onClick={onClose}>
            Keep order
          </Button>
          <Button className="flex-1" loading={busy} disabled={!reason.trim()} onClick={submit}>
            Void order
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function OrderPanel({ orderId, onChanged, onClose }: any) {
  const toast = useToast();
  const { data, error, loading, reload, refresh } = useFetch(
    () => respond(getOrderWithPayment(orderId)),
    [orderId],
  );
  const [busy, setBusy] = useState(null);
  const [modal, setModal] = useState(null);

  useEffect(
    () =>
      subscribeToOrders((p) => {
        if (p.new?.id === orderId) refresh();
      }),
    [orderId, refresh],
  );

  const order = data?.data;

  const act = async (key, fn, success) => {
    setBusy(key);
    try {
      await fn();
      if (success) toast.success(success);
      await refresh();
      onChanged();
    } catch (err) {
      toast.error(err.friendly);
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <OrderPanelSkeleton />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const open = ACTIVE.includes(order.status);
  const next = NEXT_STATUS[order.status];
  const isDelivery = order.fulfillment_type === 'delivery';
  const canPay = open && !isDelivery && ['unpaid', 'failed'].includes(order.payment_status);
  // Delivery orders finish with the rider, not at the counter; kiosk and walk-in orders are paid first.
  const canAdvance =
    open &&
    next &&
    !(isDelivery && ['ready', 'out_for_delivery'].includes(order.status)) &&
    !(next.to === 'preparing' && mustPayFirst(order));
  const more = [
    ...(order.status === 'pending' && ['unpaid', 'failed'].includes(order.payment_status)
      ? [{ label: 'Edit items', onClick: () => setModal('edit') }]
      : []),
    // A GCash payment waiting on staff is approved or rejected first: the money may be in.
    ...(open && order.payment_status !== 'processing'
      ? [{ label: 'Void order', danger: true, onClick: () => setModal('void') }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-extrabold leading-none">{order.order_number}</h2>
          <p className="mt-1 font-medium">{order.customer_name || 'Guest'}</p>
          <MethodLabel order={order} />
          <p className="text-xs text-ink-soft">{timeAgo(order.created_at)}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge status={order.status} />
          <PaymentBadge status={order.payment_status} />
          {onClose && (
            <button onClick={onClose} className="text-xs font-semibold text-ink-soft underline">
              Close
            </button>
          )}
        </div>
      </div>

      {order.scheduled_for && !['completed', 'cancelled', 'voided'].includes(order.status) && (
        <ScheduledBanner at={order.scheduled_for} />
      )}

      {isDelivery && (
        <div className="rounded-2xl bg-cream-deep/60 p-3 text-sm">
          <p className="font-semibold">Delivery</p>
          <p>{addressLine(order.delivery_address)}</p>
          <MapLink address={order.delivery_address} className="text-xs" />
          {order.customer_phone && <p className="text-ink-soft">{order.customer_phone}</p>}
          {order.rider_id && <p className="mt-1 text-xs font-semibold text-leaf">Claimed by a rider</p>}
        </div>
      )}

      <OrderLines items={order.order_items} />
      <div className="flex justify-between border-t border-ink/10 pt-3 text-xl font-bold">
        <span>Total</span>
        <span className="text-brand">{money(order.total_amount)}</span>
      </div>
      {order.notes && <p className="text-sm text-ink-soft">Note: “{order.notes}”</p>}
      {order.payment_status === 'processing' && <GcashReview order={order} onDone={async () => { await refresh(); onChanged(); }} />}
      {order.void_reason && (
        <p className="rounded-2xl bg-brand/10 p-3 text-sm text-brand-dark">Voided: {order.void_reason}</p>
      )}

      {/* At most: take payment, the one next step, and More (edit, void). */}
      <div className="flex flex-wrap items-center gap-2">
        {canPay && (
          <Button tone="green" onClick={() => setModal('pay')}>
            Take payment · {money(order.total_amount)}
          </Button>
        )}
        {canAdvance && (
          <Button
            loading={busy === 'advance'}
            onClick={() =>
              act('advance', () => call(advanceStatus(order.id, next.to)), `${order.order_number} → ${STATUS[next.to].label}`)
            }
          >
            {next.label}
          </Button>
        )}
        <div className="ml-auto">
          <ActionMenu items={more} />
        </div>
      </div>
      {canPay && mustPayFirst(order) && order.status === 'pending' && (
        <p className="text-sm text-ink-soft">Take payment first, then send it to the kitchen.</p>
      )}
      {isDelivery && ['ready', 'out_for_delivery'].includes(order.status) && (
        <p className="text-sm text-ink-soft">
          {order.status === 'ready' ? 'Waiting for a rider to claim this order.' : 'Out with the rider.'}
        </p>
      )}

      {modal === 'pay' && (
        <PaymentModal order={order} onClose={() => setModal(null)} onPaid={() => { refresh(); onChanged(); }} />
      )}
      {modal === 'void' && (
        <VoidModal order={order} onClose={() => setModal(null)} onDone={() => { refresh(); onChanged(); }} />
      )}
      {modal === 'edit' && (
        <Modal open onClose={() => setModal(null)} title={`Edit ${order.order_number}`} wide>
          <ItemsEditor
            branchId={order.branch_id}
            initialItems={linesFromOrder(order)}
            submitLabel="Save changes"
            onSubmit={async (items) => {
              await call(replaceItems(order.id, { items }));
              toast.success('Items updated');
              setModal(null);
              await refresh();
              onChanged();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function WalkInModal({ branch, onClose, onCreated }: any) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState('dine_in');
  const [method, setMethod] = useState('cash');

  return (
    <Modal open onClose={onClose} title={`New walk-in order · ${branch.name}`} wide>
      <ItemsEditor
        branchId={branch.id}
        submitLabel="Create order"
        canSubmit={Boolean(name.trim())}
        extra={
          <div className="space-y-2">
            <Input
              placeholder="Customer name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
            <Segmented
              value={type}
              onChange={setType}
              options={[
                { value: 'dine_in', label: 'Dine in' },
                { value: 'take_out', label: 'Take out' },
              ]}
            />
            <Segmented
              value={method}
              onChange={setMethod}
              options={[
                { value: 'cash', label: 'Cash' },
                { value: 'gcash', label: 'GCash' },
              ]}
            />
          </div>
        }
        onSubmit={async (items) => {
          const data = await call(
            createWalkInOrder({ branch_id: branch.id, fulfillment_type: type, customer_name: name.trim(), payment_method: method, items }),
          );
          toast.success(`Order ${data.order_number} created`);
          onCreated(data.id);
          onClose();
        }}
      />
    </Modal>
  );
}

// A register works at one branch. A cashier login has exactly one; an admin of
// several picks which register they are standing at.
export default function Pos() {
  return (
    <StaffBranchProvider storageKey="3k.posBranch">
      <Register />
    </StaffBranchProvider>
  );
}

function Register() {
  const { logout } = useAuth();
  const { branch, branchId, loading: branchLoading } = useStaffBranch();
  const wide = useMedia('(min-width: 1024px)');
  const [tab, setTab] = useState('active');
  const [channel, setChannel] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [selected, setSelected] = useState(null);
  const [walkIn, setWalkIn] = useState(false);
  const [messages, setMessages] = useState(false);
  const inbox = useInbox(branchId);

  // Switching registers: the open order belongs to the other branch.
  useEffect(() => setSelected(null), [branchId]);

  // The API filters by one status at a time. Fetching "the latest 100 orders" and
  // filtering here meant that on a busy day the Active and Cancelled tabs silently
  // missed anything older than the last 100 orders of any kind, so each tab asks
  // for exactly the statuses it shows and merges them.
  const statuses = { active: ACTIVE, completed: ['completed'], closed: ['cancelled', 'voided'] }[tab] ?? [undefined];
  const { data, error, loading, reload, refresh } = useFetch(async () => {
    if (!branchId) return { data: [] };
    // One request for the whole tab, up to 100 orders per status as before.
    const page = await call(
      listStaffOrders({
        branch_id: branchId,
        limit: 100 * statuses.length,
        q: q || undefined,
        channel: channel || undefined,
        ...(statuses[0] ? { statuses } : {}),
      }),
    );
    return { data: page.data };
  }, [q, channel, tab, branchId]);

  useEffect(() => subscribeToOrders(() => refresh()), [refresh]);

  // Scheduled orders queue by their slot, not by when they were placed.
  const [scheduledOnly, setScheduledOnly] = useState(false);
  const scheduledCount = (data?.data ?? []).filter((o) => o.scheduled_for && ACTIVE.includes(o.status)).length;
  const orders = useMemo(() => {
    const all = data?.data ?? [];
    if (tab === 'active') {
      return all
        .filter((o) => ACTIVE.includes(o.status) && (!scheduledOnly || o.scheduled_for))
        .sort((a, b) => new Date(dueAt(a)).getTime() - new Date(dueAt(b)).getTime());
    }
    return all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [data, tab, scheduledOnly]);

  const counts = useMemo(() => {
    const c = {};
    (data?.data ?? []).forEach((o) => {
      c[o.status] = (c[o.status] ?? 0) + 1;
    });
    return c;
  }, [data]);

  const onChanged = useCallback(() => refresh(), [refresh]);

  return (
    <div className="min-h-screen bg-cream">
      <StaffBar title="Cashier" subtitle={branch?.name} onLogout={logout}>
        <BranchPicker />
        <button
          onClick={() => setMessages(true)}
          className="relative flex items-center gap-1.5 rounded-xl bg-ink/5 px-3 py-2 text-sm font-medium text-ink transition hover:bg-ink/10"
        >
          <Chat size={16} /> <span className="hidden sm:inline">Messages</span>
          {inbox.unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold text-white">
              {inbox.unread}
            </span>
          )}
        </button>
        <Button tone="sun" size="sm" onClick={() => setWalkIn(true)} disabled={!branch}>
          <Plus size={16} /> Walk-in
        </Button>
      </StaffBar>

      <div className="mx-auto grid max-w-[1500px] gap-4 p-4 lg:grid-cols-[minmax(340px,440px)_1fr]">
        <section className="space-y-3">
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find by name or order number"
              maxLength={120}
              aria-label="Search orders"
              className="w-full rounded-xl border border-line bg-white py-2.5 pl-11 pr-4 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented value={tab} onChange={setTab} options={TABS} />
            <Select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              aria-label="Channel"
              className="!w-auto !py-2 !text-sm"
            >
              <option value="">All channels</option>
              <option value="kiosk">Kiosk</option>
              <option value="pos">Counter</option>
              <option value="online">Online</option>
            </Select>
          </div>
          {tab === 'active' && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {ACTIVE.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-semibold text-ink-soft">
                  {STATUS[s].label}{' '}
                  {(loading && !data) || branchLoading ? <Skeleton as="span" className="inline-block h-3 w-3" /> : (counts[s] ?? 0)}
                </span>
              ))}
              {scheduledCount > 0 && (
                <button
                  type="button"
                  onClick={() => setScheduledOnly((v) => !v)}
                  aria-pressed={scheduledOnly}
                  className={`rounded-full px-2.5 py-1 font-semibold ring-1 ring-amber-300 ${
                    scheduledOnly ? 'bg-amber-400 text-ink' : 'bg-amber-50 text-amber-900'
                  }`}
                >
                  Scheduled {scheduledCount}
                </button>
              )}
            </div>
          )}

          <ErrorNote error={error} onRetry={reload} />
          {((loading && !data) || branchLoading) && <QueueSkeleton />}
          {!loading && !branchLoading && !error && orders.length === 0 && (
            <Empty title="Nothing here" hint="New orders appear instantly." />
          )}
          <div className="space-y-2">
            {orders.map((o) => (
              <QueueRow key={o.id} order={o} selected={o.id === selected} onSelect={setSelected} />
            ))}
          </div>
        </section>

        {wide && (
          <section className="rounded-3xl border border-ink/10 bg-paper p-5 shadow-sm lg:sticky lg:top-20 lg:self-start">
            {selected ? (
              <OrderPanel key={selected} orderId={selected} onChanged={onChanged} />
            ) : (
              <Empty title="Select an order" hint="Pick one from the queue to work on it." />
            )}
          </section>
        )}
      </div>

      {!wide && selected && (
        <Modal open onClose={() => setSelected(null)} title="Order">
          <OrderPanel key={selected} orderId={selected} onChanged={onChanged} />
        </Modal>
      )}

      {messages && <StaffInbox inbox={inbox} onClose={() => setMessages(false)} />}
      {walkIn && branch && <WalkInModal branch={branch} onClose={() => setWalkIn(false)} onCreated={setSelected} />}
    </div>
  );
}
