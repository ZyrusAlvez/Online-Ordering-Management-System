'use client';

import { useEffect } from 'react';
import { Link, useSearchParams } from '@/utils/navigation';
import { call } from '@/utils/apiError';
import { listMyOrders } from '@/controllers/orderController';
import { useFetch } from '@/hooks/hooks';
import { subscribeToOrders } from '@/hooks/realtime';
import { dateTime, money, scheduleLabel } from '@/utils/format';
import { Button, Card, Empty, ErrorNote, PageLoader, Pagination } from '@/view/components/ui';
import { MethodLabel, PaymentBadge, StatusBadge } from '@/view/components/OrderParts';

export default function Orders() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1);

  const { data, error, loading, reload, refresh } = useFetch(
    () => call(listMyOrders({ page, limit: 10 })),
    [page],
  );

  // Live updates: any change to one of my orders refreshes the list.
  useEffect(() => subscribeToOrders(() => refresh()), [refresh]);

  const orders = data?.data ?? [];

  return (
    <div className="mx-auto mt-2 max-w-3xl">
      <h1 className="mb-4 font-display text-4xl">
        My orders
      </h1>
      <ErrorNote error={error} onRetry={reload} />
      {loading && !data && <PageLoader />}
      {!loading && !error && orders.length === 0 && (
        <Empty
          title="No orders yet"
          hint="Your orders will show up here once you place one."
          action={
            <Button to="/menu" className="mt-3">Order something</Button>
          }
        />
      )}
      <div className="space-y-3">
        {orders.map((o) => (
          <Link key={o.id} to={`/orders/${o.id}`} className="block">
            <Card className="transition hover:border-ink/25">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">{o.order_number}</p>
                  <p className="text-xs text-ink-soft">
                    {dateTime(o.created_at)}
                    {o.branch?.name ? ` · ${o.branch.name}` : ''}
                  </p>
                  {o.scheduled_for && (
                    <p className="text-xs font-semibold text-amber-800">For {scheduleLabel(o.scheduled_for)}</p>
                  )}
                  <MethodLabel order={o} />
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-brand">{money(o.total_amount)}</p>
                  <div className="mt-1 flex justify-end gap-1.5">
                    <StatusBadge status={o.status} />
                    <PaymentBadge status={o.payment_status} />
                  </div>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
      <Pagination meta={data?.meta} onPage={(p) => setParams({ page: p })} />
    </div>
  );
}
