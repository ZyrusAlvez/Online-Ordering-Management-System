import { useCallback, useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../lib/api.js';
import { useInbox } from '../../lib/chat.js';
import { useDebounced, useFetch, useTick } from '../../lib/hooks.js';
import { subscribeToOrders } from '../../lib/supabase.js';
import {
  CHANNEL,
  FULFILLMENT,
  NEXT_STATUS,
  STATUS,
  minutesUntil,
  money,
  timeAgo,
} from '../../lib/format.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { StaffBar } from '../../components/Layouts.jsx';
import { BranchPicker, StaffBranchProvider, useStaffBranch } from '../../components/StaffBranch.jsx';
import StaffInbox from '../../components/chat/StaffInbox.jsx';
import ItemsEditor, { linesFromOrder } from '../../components/ItemsEditor.jsx';
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
} from '../../components/OrderParts.jsx';
import {
  Button,
  Empty,
  ErrorNote,
  Field,
  Input,
  Modal,
  PageLoader,
  Segmented,
  Select,
  Textarea,
} from '../../components/ui.jsx';
import { Chat, Plus, Search } from '../../components/icons.jsx';

const ACTIVE = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'];
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
  if (!order.scheduled_for || !['pending', 'confirmed'].includes(order.status)) return '';
  return minutesUntil(order.scheduled_for) <= DUE_SOON_MINUTES ? 'border-l-4 border-l-orange-600' : 'border-l-4 border-l-amber-400';
};

function QueueRow({ order, selected, onSelect }) {
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

function CashModal({ order, onClose, onPaid }) {
  const toast = useToast();
  const [tendered, setTendered] = useState(String(order.total_amount));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const amount = Number(tendered);
  const change = Math.max(0, amount - Number(order.total_amount));
  const short = amount < Number(order.total_amount);
  const quick = [...new Set([Number(order.total_amount), 100, 200, 500, 1000])].filter(
    (n) => n >= Number(order.total_amount),
  );

  const pay = async () => {
    setBusy(true);
    try {
      const res = await api.post(
        `/pos/orders/${order.id}/payment/cash`,
        { tendered_amount: amount },
        { auth: true },
      );
      setDone(res.meta);
      onPaid();
    } catch (err) {
      toast.error(err.friendly);
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={done ? 'Payment received' : `Cash · ${order.order_number}`}>
      {done ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-ink-soft">Change to give back</p>
          <p className="text-6xl font-extrabold text-leaf">{money(done.change)}</p>
          <p className="text-sm text-ink-soft">Tendered {money(done.tendered)}</p>
          <Button size="lg" className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
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
            Confirm payment
          </Button>
        </div>
      )}
    </Modal>
  );
}

function GcashModal({ order, onClose }) {
  const toast = useToast();
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let live = true;
    api
      .post(`/pos/orders/${order.id}/payment/gcash`, undefined, { auth: true })
      .then((res) => live && setUrl(res.data.checkout_url))
      .catch((err) => {
        toast.error(err.friendly);
        onClose();
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  // The webhook flips the order to paid; Realtime refreshes it, so close on success.
  useEffect(() => {
    if (order.payment_status === 'paid') {
      toast.success(`${order.order_number} paid with GCash`);
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.payment_status]);

  return (
    <Modal open onClose={onClose} title={`GCash · ${order.order_number}`}>
      {!url ? (
        <PageLoader label="Creating payment…" />
      ) : (
        <div className="space-y-4 text-center">
          <p className="text-lg">
            Amount due <strong>{money(order.total_amount)}</strong>
          </p>
          <div className="mx-auto w-fit rounded-3xl bg-white p-4 shadow">
            <QRCodeSVG value={url} size={240} />
          </div>
          <p className="text-sm text-ink-soft">
            Have the customer scan this to pay. This window closes when payment is received.
          </p>
          <a href={url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand underline">
            Open payment page
          </a>
        </div>
      )}
    </Modal>
  );
}

function VoidModal({ order, onClose, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/pos/orders/${order.id}/void`, { reason: reason.trim() }, { auth: true });
      toast.success(res.meta?.refund_id ? 'Order voided and GCash refund started' : 'Order voided');
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
            This order was paid by GCash. Voiding it will refund the customer automatically.
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

function OrderPanel({ orderId, onChanged, onClose }) {
  const toast = useToast();
  const { data, error, loading, reload, refresh } = useFetch(
    () => api.get(`/pos/orders/${orderId}`, { auth: true }),
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

  if (loading) return <PageLoader />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const open = ACTIVE.includes(order.status);
  const next = NEXT_STATUS[order.status];
  const isDelivery = order.fulfillment_type === 'delivery';
  // Delivery orders finish with the rider, not at the counter.
  const canAdvance =
    open && next && !(isDelivery && ['ready', 'out_for_delivery'].includes(order.status));
  const canPay =
    open && !isDelivery && ['unpaid', 'failed'].includes(order.payment_status);
  const canEdit = ['pending', 'confirmed'].includes(order.status);

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
      {order.void_reason && (
        <p className="rounded-2xl bg-brand/10 p-3 text-sm text-brand-dark">Voided: {order.void_reason}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {canPay && (
          <>
            <Button tone="green" onClick={() => setModal('cash')}>
              Take cash
            </Button>
            <Button tone="sun" onClick={() => setModal('gcash')}>
              GCash QR
            </Button>
          </>
        )}
        {canAdvance && (
          <Button
            loading={busy === 'advance'}
            onClick={() =>
              act(
                'advance',
                () =>
                  order.status === 'pending'
                    ? api.post(`/pos/orders/${order.id}/confirm`, undefined, { auth: true })
                    : api.patch(`/pos/orders/${order.id}/status`, { status: next.to }, { auth: true }),
                `${order.order_number} → ${STATUS[next.to].label}`,
              )
            }
          >
            {next.label}
          </Button>
        )}
        {canAdvance && order.status === 'pending' && (
          <Button
            tone="outline"
            loading={busy === 'prep'}
            onClick={() =>
              act(
                'prep',
                () => api.patch(`/pos/orders/${order.id}/status`, { status: 'preparing' }, { auth: true }),
                `${order.order_number} → Preparing`,
              )
            }
          >
            Send to kitchen
          </Button>
        )}
        {canEdit && (
          <Button tone="outline" onClick={() => setModal('edit')}>
            Edit items
          </Button>
        )}
        {open && (
          <Button tone="danger" onClick={() => setModal('void')}>
            Void
          </Button>
        )}
      </div>
      {isDelivery && ['ready', 'out_for_delivery'].includes(order.status) && (
        <p className="text-sm text-ink-soft">
          {order.status === 'ready' ? 'Waiting for a rider to claim this order.' : 'Out with the rider.'}
        </p>
      )}

      {modal === 'cash' && (
        <CashModal order={order} onClose={() => setModal(null)} onPaid={() => { refresh(); onChanged(); }} />
      )}
      {modal === 'gcash' && <GcashModal order={order} onClose={() => { setModal(null); onChanged(); }} />}
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
              await api.patch(`/pos/orders/${order.id}/items`, { items }, { auth: true });
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

function WalkInModal({ branch, onClose, onCreated }) {
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
          const { data } = await api.post(
            '/pos/orders',
            { branch_id: branch.id, fulfillment_type: type, customer_name: name.trim(), payment_method: method, items },
            { auth: true },
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
  const { branch, branchId } = useStaffBranch();
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
    const pages = await Promise.all(
      statuses.map((status) =>
        api.get('/pos/orders', {
          auth: true,
          query: { branch_id: branchId, limit: 100, q: q || undefined, channel: channel || undefined, status },
        }),
      ),
    );
    return { data: pages.flatMap((p) => p.data) };
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
        .sort((a, b) => new Date(dueAt(a)) - new Date(dueAt(b)));
    }
    return all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
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
                <span key={s} className="rounded-full bg-white px-2.5 py-1 font-semibold text-ink-soft">
                  {STATUS[s].label} {counts[s] ?? 0}
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
          {loading && !data && <PageLoader />}
          {!loading && !error && orders.length === 0 && (
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
