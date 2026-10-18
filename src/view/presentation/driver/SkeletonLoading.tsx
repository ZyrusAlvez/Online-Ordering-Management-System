'use client';

import { Card, Skeleton, SkeletonGroup } from '@/view/components/ui';

/** Delivery cards: order number and customer, total and payment badge, the address box, a button. */
export function DeliveriesSkeleton({ count = 3 }: { count?: number }) {
  return (
    <SkeletonGroup label="Loading deliveries…" className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="flex flex-col items-end gap-2">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-2xl" />
        </Card>
      ))}
    </SkeletonGroup>
  );
}
