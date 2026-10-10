import { useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { CHANNEL, addDays, manilaToday, money, shortDay, startOfMonth } from '../../lib/format.js';
import { Button, Card, Empty, ErrorNote, Input, PageLoader, Segmented } from '../../components/ui.jsx';
import { useStaffBranch } from '../../components/StaffBranch.jsx';

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom' },
];

const METHOD = {
  cash: { label: 'Cash', bar: 'bg-ink' },
  gcash: { label: 'GCash', bar: 'bg-brand' },
  unknown: { label: 'Other', bar: 'bg-ink-soft' },
};

const rangeFor = (preset, custom) => {
  const today = manilaToday();
  if (preset === 'today') return { from: today, to: today };
  if (preset === '7d') return { from: addDays(today, -6), to: today };
  if (preset === '30d') return { from: addDays(today, -29), to: today };
  if (preset === 'month') return { from: startOfMonth(today), to: today };
  return custom;
};

const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

function Stat({ label, value, hint }) {
  return (
    <Card className="!p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-soft">{hint}</p>}
    </Card>
  );
}

/** One bar per day. The table beneath carries the same numbers, so the chart is never the only source. */
function DailyChart({ daily }) {
  const max = Math.max(...daily.map((d) => d.revenue), 0);
  const summary = `Daily sales from ${shortDay(daily[0].date)} to ${shortDay(daily.at(-1).date)}. Highest day ${money(max)}.`;
  // Few days: label every bar. Many days: only the first, middle and last, so labels never collide.
  const labelled = (i) => daily.length <= 10 || i === 0 || i === daily.length - 1 || i === Math.floor((daily.length - 1) / 2);

  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-semibold">Sales per day</h2>
      <div role="img" aria-label={summary} className="flex gap-[3px]">
        {daily.map((d, i) => (
          <div
            key={d.date}
            className="group flex min-w-0 flex-1 flex-col items-center"
            title={`${shortDay(d.date)}: ${money(d.revenue)} (${d.orders} ${d.orders === 1 ? 'order' : 'orders'})`}
          >
            <div className="flex h-40 w-full items-end justify-center sm:h-48">
              <div
                className={`w-full max-w-[44px] rounded-t-sm transition group-hover:opacity-80 ${d.revenue > 0 ? 'bg-brand' : 'bg-line'}`}
                style={{ height: d.revenue > 0 ? `${Math.max(pct(d.revenue, max), 3)}%` : '2px' }}
              />
            </div>
            <span className="mt-1.5 h-4 whitespace-nowrap text-[11px] text-ink-soft">{labelled(i) ? shortDay(d.date) : ''}</span>
          </div>
        ))}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-ink-soft hover:text-ink">View as table</summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-line">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-cream text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-3 py-2">Day</th>
                <th className="px-3 py-2 text-right">Orders</th>
                <th className="px-3 py-2 text-right">Sales</th>
              </tr>
            </thead>
            <tbody>
              {[...daily].reverse().map((d) => (
                <tr key={d.date} className="border-t border-line">
                  <td className="px-3 py-2">{shortDay(d.date, true)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.orders}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(d.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

function MethodSplit({ rows, total }) {
  const summary = rows.map((r) => `${METHOD[r.method]?.label ?? r.method} ${money(r.revenue)}`).join(', ');
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-semibold">Cash vs GCash</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">No payments yet.</p>
      ) : (
        <>
          <div role="img" aria-label={summary} className="flex h-4 overflow-hidden rounded-full bg-line">
            {rows.map((r) => (
              <div key={r.method} className={METHOD[r.method]?.bar ?? 'bg-ink-soft'} style={{ width: `${pct(r.revenue, total)}%` }} />
            ))}
          </div>
          <ul className="space-y-1.5 text-sm">
            {rows.map((r) => (
              <li key={r.method} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${METHOD[r.method]?.bar ?? 'bg-ink-soft'}`} aria-hidden="true" />
                  {METHOD[r.method]?.label ?? r.method}
                  <span className="text-ink-soft">· {r.orders} {r.orders === 1 ? 'order' : 'orders'} · {Math.round(pct(r.revenue, total))}%</span>
                </span>
                <span className="font-semibold tabular-nums">{money(r.revenue)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

/** Revenue per channel or per branch, as bars scaled to the largest. */
function RevenueBars({ title, rows, keyOf, labelOf }) {
  const max = Math.max(...rows.map((r) => r.revenue), 0);
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">No sales yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={keyOf(r)}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{labelOf(r)}</span>
                <span className="tabular-nums">
                  <span className="font-semibold">{money(r.revenue)}</span>
                  <span className="text-ink-soft"> · {r.orders} {r.orders === 1 ? 'order' : 'orders'}</span>
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-line" role="img" aria-label={`${labelOf(r)}: ${money(r.revenue)}`}>
                <div className="h-full rounded-full bg-ink" style={{ width: `${pct(r.revenue, max)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function BestSellers({ items }) {
  const max = Math.max(...items.map((i) => i.quantity), 0);
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-semibold">Best sellers</h2>
      {items.length === 0 ? (
        <p className="text-sm text-ink-soft">Nothing sold in this period.</p>
      ) : (
        <ol className="space-y-3">
          {items.map((item, i) => (
            <li key={`${item.product_id}-${item.variant ?? ''}`}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="mr-2 text-ink-soft tabular-nums">{i + 1}.</span>
                  <span className="font-medium">{item.name}</span>
                  {item.variant && <span className="text-ink-soft"> · {item.variant}</span>}
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-semibold">{item.quantity}×</span>
                  <span className="text-ink-soft"> · {money(item.revenue)}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                <div className="h-full rounded-full bg-brand" style={{ width: `${pct(item.quantity, max)}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

const channelLabel = (r) => CHANNEL[r.channel] ?? r.channel;

export default function AdminSales() {
  const { branchId, query: branchQuery } = useStaffBranch();
  const [preset, setPreset] = useState('7d');
  const [custom, setCustom] = useState(() => ({ from: addDays(manilaToday(), -6), to: manilaToday() }));

  const range = useMemo(() => rangeFor(preset, custom), [preset, custom]);
  const rangeError =
    preset === 'custom' && (!custom.from || !custom.to || custom.to < custom.from)
      ? 'Choose a start date that is not after the end date.'
      : null;

  const { data, error, loading, reload, refresh } = useFetch(
    () => (rangeError ? Promise.resolve(null) : api.get('/admin/sales', { auth: true, query: { ...range, ...branchQuery } })),
    [range.from, range.to, rangeError, branchId],
  );

  const report = data?.data;
  const hasSales = report && report.totals.orders > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl">Sales</h1>
          {report && (
            <p className="mt-1 text-sm text-ink-soft">
              {report.range.from === report.range.to
                ? shortDay(report.range.from, true)
                : `${shortDay(report.range.from, true)} to ${shortDay(report.range.to, true)}`}
            </p>
          )}
        </div>
        <Button tone="outline" size="sm" onClick={refresh}>
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={preset} onChange={setPreset} options={PRESETS} className="max-w-full overflow-x-auto" />
        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label="From date"
              value={custom.from}
              max={manilaToday()}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              className="!w-auto"
            />
            <span className="text-ink-soft">to</span>
            <Input
              type="date"
              aria-label="To date"
              value={custom.to}
              max={manilaToday()}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              className="!w-auto"
            />
          </div>
        )}
      </div>

      {rangeError && <ErrorNote error={new Error(rangeError)} />}
      <ErrorNote error={error} onRetry={reload} />
      {loading && !report && !rangeError && <PageLoader />}

      {report && !rangeError && (
        <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Sales" value={money(report.totals.revenue)} />
            <Stat label="Orders" value={report.totals.orders} />
            <Stat label="Average order" value={money(report.totals.average_order)} />
            <Stat label="Items sold" value={report.totals.items_sold} />
          </div>

          {report.refunds_pending.orders > 0 && (
            <p role="status" className="rounded-xl border border-sun/40 bg-sun/10 px-4 py-3 text-sm">
              <strong>{report.refunds_pending.orders}</strong> voided {report.refunds_pending.orders === 1 ? 'order' : 'orders'} (
              {money(report.refunds_pending.amount)}) {report.refunds_pending.orders === 1 ? 'is' : 'are'} still waiting on a
              GCash refund. They are not counted as sales.
            </p>
          )}

          {!hasSales ? (
            <Empty title="No sales in this period" hint="Paid orders show up here as soon as they are paid." />
          ) : (
            <>
              <DailyChart daily={report.daily} />
              <div className="grid gap-4 lg:grid-cols-2">
                <MethodSplit rows={report.by_method} total={report.totals.revenue} />
                <RevenueBars title="By channel" rows={report.by_channel} keyOf={(r) => r.channel} labelOf={channelLabel} />
              </div>
              {/* Only worth showing when the report covers more than one branch. */}
              {!branchId && report.by_branch?.length > 1 && (
                <RevenueBars title="By branch" rows={report.by_branch} keyOf={(r) => r.branch_id} labelOf={(r) => r.name} />
              )}
              <BestSellers items={report.top_items} />
            </>
          )}

          <p className="text-xs text-ink-soft">
            A sale is an order that has been paid and not voided or cancelled, counted on the day it was placed. Days are
            Manila days.
          </p>
        </div>
      )}
    </div>
  );
}
