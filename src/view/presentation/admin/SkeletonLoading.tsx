'use client';

import { Card, Skeleton, SkeletonGroup } from '@/view/components/ui';

/** The admin order table: its header row stays real, the body rows pulse. */
export function OrdersTableSkeleton({ rows = 8, columns = 8 }: { rows?: number; columns?: number }) {
  return (
    <SkeletonGroup label="Loading orders…" className="overflow-hidden rounded-3xl border border-ink/10 bg-paper">
      <div className="border-b border-ink/10 px-4 py-3">
        <Skeleton className="h-3 w-1/2" />
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-ink/5 px-4 py-3 last:border-0">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={`h-4 ${c === 0 ? 'w-16' : 'flex-1'}`} />
          ))}
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** Sales: the four figures, the daily chart and the two breakdowns. */
export function SalesSkeleton() {
  return (
    <SkeletonGroup label="Loading the sales report…" className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="space-y-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-24" />
          </Card>
        ))}
      </div>
      <Card className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <div className="flex h-48 items-end gap-2">
          {[40, 65, 30, 80, 55, 70, 45].map((h, i) => (
            <Skeleton key={i} className="flex-1 rounded-md" style={{ height: `${h}%` }} />
          ))}
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i} className="space-y-3">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </Card>
        ))}
      </div>
    </SkeletonGroup>
  );
}

/** Admin menu: category sections, each a heading and a list of products. */
export function MenuSectionsSkeleton({ sections = 3 }: { sections?: number }) {
  return (
    <SkeletonGroup label="Loading the menu…" className="space-y-4">
      {Array.from({ length: sections }, (_, s) => (
        <section key={s} className="rounded-3xl border border-ink/10 bg-paper">
          <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-8 w-28 rounded-xl" />
          </div>
          <div className="divide-y divide-ink/5">
            {Array.from({ length: 3 }, (_, p) => (
              <div key={p} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-12 w-12 rounded-xl" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
                <Skeleton className="h-8 w-40 rounded-xl" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </SkeletonGroup>
  );
}

/** Branches: a two-column grid of branch cards. */
export function BranchCardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <SkeletonGroup label="Loading branches…" className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-start justify-between gap-3 rounded-2xl border border-ink/10 bg-paper p-4">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-8 w-14 rounded-xl" />
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}
