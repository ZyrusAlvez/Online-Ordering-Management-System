import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { CHANNEL, FULFILLMENT, PAYMENT, STATUS, dateTime, money } from '../../lib/format.js';
import { useToast } from '../../context/ToastContext.jsx';
import { MapLink, MethodLabel, OrderLines, PaymentBadge, StatusBadge, addressLine } from '../../components/OrderParts.jsx';
import { Button, Empty, ErrorNote, Input, Modal, PageLoader, Pagination, Select } from '../../components/ui.jsx';

const toIso = (date, end) => (date ? new Date(`${date}T${end ? '23:59:59.999' : '00:00:00'}`).toISOString() : undefined);

export default function AdminOrders() {
  const toast = useToast();
  const [filters, setFilters] = useState({ status: '', payment_status: '', channel: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data, error, loading, reload, refresh } = useFetch(
    () =>
      api.get('/admin/orders', {
        auth: true,
        query: {
          page,
          limit: 20,
          status: filters.status || undefined,
          payment_status: filters.payment_status || undefined,
          channel: filters.channel || undefined,
          from: toIso(filters.from, false),
          to: toIso(filters.to, true),
        },
      }),
    [page, filters],
  );

  const set = (key) => (e) => {
    setPage(1);
    setFilters((f) => ({ ...f, [key]: e.target.value }));
  };

  const retryRefund = async (order) => {
    setBusy(true);
    try {
      await api.post(`/admin/orders/${order.id}/refund/retry`, undefined, { auth: true });
      toast.success('Refund retry sent');
      setOpen(null);
      refresh();
    } catch (err) {
      toast.error(err.friendly);
    } finally {
      setBusy(false);
    }
  };

  const orders = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-4xl">
          Orders
        </h1>
        <Button tone="outline" size="sm" onClick={refresh}>
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Select value={filters.status} onChange={set('status')} aria-label="Status">
          <option value="">Any status</option>
          {Object.entries(STATUS).map(([v, s]) => (
            <option key={v} value={v}>{s.label}</option>
          ))}
        </Select>
        <Select value={filters.payment_status} onChange={set('payment_status')} aria-label="Payment">
          <option value="">Any payment</option>
          {Object.entries(PAYMENT).map(([v, s]) => (
            <option key={v} value={v}>{s.label}</option>
          ))}
        </Select>
        <Select value={filters.channel} onChange={set('channel')} aria-label="Channel">
          <option value="">Any channel</option>
          {Object.entries(CHANNEL).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </Select>
        <Input type="date" value={filters.from} onChange={set('from')} aria-label="From date" />
        <Input type="date" value={filters.to} onChange={set('to')} aria-label="To date" />
      </div>

      <ErrorNote error={error} onRetry={reload} />
      {loading && !data && <PageLoader />}
      {!loading && !error && orders.length === 0 && <Empty title="No orders match" />}

      {orders.length > 0 && (
        <div className="overflow-x-auto rounded-3xl border border-ink/10 bg-paper">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => setOpen(o)}
                  className="cursor-pointer border-b border-ink/5 last:border-0 hover:bg-cream-deep/40"
                >
                  <td className="px-4 py-3 font-bold">{o.order_number}</td>
                  <td className="px-4 py-3">{o.customer_name || '—'}</td>
                  <td className="px-4 py-3 text-ink-soft">
                    {CHANNEL[o.channel]} · {FULFILLMENT[o.fulfillment_type]}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                  <td className="px-4 py-3"><PaymentBadge status={o.payment_status} /></td>
                  <td className="px-4 py-3 text-right font-semibold">{money(o.total_amount)}</td>
                  <td className="px-4 py-3 text-ink-soft">{dateTime(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination meta={data?.meta} onPage={setPage} />

      {open && (
        <Modal open onClose={() => setOpen(null)} title={open.order_number}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={open.status} />
              <PaymentBadge status={open.payment_status} />
              <MethodLabel order={open} />
            </div>
            <p className="text-sm text-ink-soft">
              {open.customer_name || 'Guest'} · {dateTime(open.created_at)}
              {open.customer_phone ? ` · ${open.customer_phone}` : ''}
            </p>
            {open.fulfillment_type === 'delivery' && (
              <p className="rounded-2xl bg-cream-deep/60 p-3 text-sm">
                {addressLine(open.delivery_address)}
                <MapLink address={open.delivery_address} className="ml-2" />
              </p>
            )}
            <OrderLines items={open.order_items} />
            <div className="flex justify-between border-t border-ink/10 pt-3 text-lg font-bold">
              <span>Total</span>
              <span className="text-brand">{money(open.total_amount)}</span>
            </div>
            {open.void_reason && <p className="text-sm text-brand-dark">Voided: {open.void_reason}</p>}
            {open.payment_status === 'refund_failed' && (
              <Button loading={busy} onClick={() => retryRefund(open)}>
                Retry refund
              </Button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
