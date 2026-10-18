'use client';

import { Card, Skeleton, SkeletonGroup } from '@/view/components/ui';

/** My orders: order cards with number and date on the left, total and badges on the right. */
export function OrdersSkeleton({ count = 4 }: { count?: number }) {
  return (
    <SkeletonGroup label="Loading your orders…" className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i}>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-3 w-44" />
              <Skeleton className="h-3 w-32" />
            </div>
            <div className="flex flex-col items-end gap-2">
              <Skeleton className="h-5 w-20" />
              <div className="flex gap-1.5">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
          </div>
        </Card>
      ))}
    </SkeletonGroup>
  );
}

/** One order: header, the five-step timeline, the lines and the total. */
export function OrderDetailSkeleton() {
  return (
    <SkeletonGroup label="Loading your order…" className="mx-auto mt-2 max-w-2xl space-y-4">
      <Skeleton className="h-4 w-24" />
      <Card className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-3 w-56" />
            <Skeleton className="h-3 w-36" />
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
        <div className="flex justify-between px-4">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="flex justify-between">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
        <div className="flex justify-between border-t border-ink/10 pt-3">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-24" />
        </div>
      </Card>
    </SkeletonGroup>
  );
}

/** Profile: avatar and name, then the contact and address cards. */
export function ProfileSkeleton() {
  return (
    <SkeletonGroup label="Loading your profile…" className="mx-auto mt-2 max-w-2xl space-y-5">
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <Card className="space-y-4">
        <Skeleton className="h-5 w-24" />
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-11 w-full rounded-2xl" />
            </div>
          ))}
        </div>
      </Card>
      <Card className="space-y-4">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-11 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </Card>
    </SkeletonGroup>
  );
}
