import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { subscribeToOrders } from '../../lib/supabase.js';
import { money, timeAgo } from '../../lib/format.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { StaffBar } from '../../components/Layouts.jsx';
import DeliveryChat from '../../components/chat/DeliveryChat.jsx';
import { MapLink, OrderLines, ScheduledBadge, addressLine } from '../../components/OrderParts.jsx';
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Input,
  Modal,
  PageLoader,
  Segmented,
} from '../../components/ui.jsx';
import { Chat, Phone, Pin } from '../../components/icons.jsx';

function DeliveryCard({ order, children }) {
  const cod = order.payment_status !== 'paid';
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-extrabold leading-none">{order.order_number}</p>
          <p className="mt-1 text-sm font-medium">{order.customer_name || 'Customer'}</p>
          <p className="text-xs text-ink-soft">{timeAgo(order.created_at)}</p>
          {order.scheduled_for && <ScheduledBadge at={order.scheduled_for} className="mt-1" />}
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-brand">{money(order.total_amount)}</p>
          {cod ? <Badge tone="amber">Collect cash</Badge> : <Badge tone="green">Paid</Badge>}
        </div>
      </div>

      <div className="space-y-1 rounded-2xl bg-cream-deep/60 p-3 text-sm">
        <p className="flex items-start gap-2">
          <Pin size={16} className="mt-0.5 shrink-0 text-brand" />
          <span>
            {addressLine(order.delivery_address)}
            {order.delivery_address?.landmark && (
              <span className="block text-ink-soft">Near {order.delivery_address.landmark}</span>
            )}
            <MapLink address={order.delivery_address} label="Open in Maps for directions" className="mt-1 block" />
            {order.delivery_address?.notes && (
              <span className="block text-ink-soft">“{order.delivery_address.notes}”</span>
            )}
          </span>
        </p>
        {order.customer_phone && (
          <a href={`tel:${order.customer_phone}`} className="flex items-center gap-2 font-semibold text-brand">
            <Phone size={16} /> {order.customer_phone}
          </a>
        )}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-ink-soft">
          {order.order_items?.length ?? 0} item types
        </summary>
        <OrderLines items={order.order_items} />
      </details>

      {children}
    </Card>
  );
}

function ChatModal({ order, onClose }) {
  return (
    <Modal open onClose={onClose} title={`Chat · ${order.order_number}`}>
      <DeliveryChat orderId={order.id} as="rider" orderKey={`${order.status}:${order.rider_id}`} />
    </Modal>
  );
}

function DeliveredModal({ order, onClose, onDone }) {
  const toast = useToast();
  const cod = order.payment_status !== 'paid';
  const [amount, setAmount] = useState(String(order.total_amount));
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(
        `/rider/orders/${order.id}/delivered`,
        cod ? { collected_amount: Number(amount) } : {},
        { auth: true },
      );
      toast.success(`${order.order_number} delivered`);
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.friendly);
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Deliver ${order.order_number}`}>
      <div className="space-y-4">
        {cod ? (
          <Field label="Cash collected" hint={`Must be at least ${money(order.total_amount)}`}>
            <Input
              type="number"
              inputMode="decimal"
              min={order.total_amount}
              step="0.01"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="!text-2xl"
            />
          </Field>
        ) : (
          <p className="text-sm text-ink-soft">This order is already paid. Confirm that it was handed over.</p>
        )}
        <Button
          size="lg"
          className="w-full"
          loading={busy}
          disabled={cod && Number(amount) < Number(order.total_amount)}
          onClick={submit}
        >
          Confirm delivered
        </Button>
      </div>
    </Modal>
  );
}

export default function Driver() {
  const { logout } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('pool');
  const [busy, setBusy] = useState(null);
  const [delivering, setDelivering] = useState(null);
  const [chatting, setChatting] = useState(null);

  const pool = useFetch(() => api.get('/rider/pool', { auth: true }), []);
  const mine = useFetch(
    () => api.get('/rider/orders', { auth: true, query: { active: tab !== 'history', limit: 50 } }),
    [tab === 'history'],
  );

  useEffect(
    () =>
      subscribeToOrders(() => {
        pool.refresh();
        mine.refresh();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const refreshAll = () => {
    pool.refresh();
    mine.refresh();
  };

  const act = async (key, path, success) => {
    setBusy(key);
    try {
      await api.post(path, undefined, { auth: true });
      toast.success(success);
    } catch (err) {
      // Another rider may have won the claim — always resync rather than assume.
      toast.error(err.status === 409 ? 'Someone else already took that order.' : err.friendly);
    } finally {
      setBusy(null);
      refreshAll();
    }
  };

  const poolOrders = pool.data?.data ?? [];
  const myOrders = mine.data?.data ?? [];
  const current = tab === 'pool' ? pool : mine;

  return (
    <div className="min-h-screen bg-cream">
      <StaffBar title="Driver" onLogout={logout}>
        <Button tone="sun" size="sm" onClick={refreshAll}>
          Refresh
        </Button>
      </StaffBar>

      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'pool', label: `Available${poolOrders.length ? ` (${poolOrders.length})` : ''}` },
            { value: 'mine', label: 'My deliveries' },
            { value: 'history', label: 'History' },
          ]}
        />

        <ErrorNote error={current.error} onRetry={current.reload} />
        {current.loading && !current.data && <PageLoader />}

        {tab === 'pool' && !pool.loading && poolOrders.length === 0 && !pool.error && (
          <Empty title="No orders waiting" hint="Ready delivery orders show up here the moment the kitchen finishes them." />
        )}
        {tab === 'pool' &&
          poolOrders.map((o) => (
            <DeliveryCard key={o.id} order={o}>
              <Button
                size="lg"
                className="w-full"
                loading={busy === o.id}
                onClick={() => act(o.id, `/rider/orders/${o.id}/claim`, `Claimed ${o.order_number}`)}
              >
                Claim this delivery
              </Button>
            </DeliveryCard>
          ))}

        {tab !== 'pool' && !mine.loading && myOrders.length === 0 && !mine.error && (
          <Empty
            title={tab === 'history' ? 'No past deliveries' : 'No active deliveries'}
            hint={tab === 'history' ? undefined : 'Claim an order from the Available tab.'}
          />
        )}
        {tab !== 'pool' &&
          myOrders.map((o) => (
            <DeliveryCard key={o.id} order={o}>
              {tab === 'mine' ? (
                <div className="flex gap-2">
                  <Button tone="outline" aria-label="Chat with customer" onClick={() => setChatting(o)}>
                    <Chat size={18} /> Chat
                  </Button>
                  <Button tone="outline" loading={busy === o.id} onClick={() => act(o.id, `/rider/orders/${o.id}/unclaim`, 'Returned to the pool')}>
                    Release
                  </Button>
                  <Button className="flex-1" onClick={() => setDelivering(o)}>
                    Mark delivered
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <Badge tone="gray">Delivered</Badge>
                  <Button tone="ghost" size="sm" onClick={() => setChatting(o)}>
                    <Chat size={16} /> View chat
                  </Button>
                </div>
              )}
            </DeliveryCard>
          ))}
      </main>

      {chatting && <ChatModal order={chatting} onClose={() => setChatting(null)} />}
      {delivering && (
        <DeliveredModal order={delivering} onClose={() => setDelivering(null)} onDone={refreshAll} />
      )}
    </div>
  );
}
