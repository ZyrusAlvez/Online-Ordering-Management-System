'use client';

import { Skeleton, SkeletonGroup } from '@/view/components/ui';

/** The order queue: compact rows with number, name, total, time and badges. */
export function QueueSkeleton({ count = 5 }: { count?: number }) {
  return (
    <SkeletonGroup label="Loading orders…" className="space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-line bg-paper p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 w-28" />
            </div>
            <div className="flex flex-col items-end gap-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
          <div className="mt-3 flex gap-1.5">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-24" />
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** The selected order: header with badges, its lines, the total and the action buttons. */
export function OrderPanelSkeleton() {
  return (
    <SkeletonGroup label="Loading the order…" className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex justify-between">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-4 w-14" />
          </div>
        ))}
      </div>
      <div className="flex justify-between border-t border-ink/10 pt-3">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-24" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-11 w-32 rounded-2xl" />
        <Skeleton className="h-11 w-28 rounded-2xl" />
      </div>
    </SkeletonGroup>
  );
}
