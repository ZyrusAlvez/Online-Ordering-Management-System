'use client';

import { Card, Skeleton, SkeletonGroup } from '@/view/components/ui';

/** The "Your branch" card in the hero while the branches load. */
export function BranchCardSkeleton() {
  return (
    <SkeletonGroup label="Loading branches…">
      <Card className="space-y-3">
        <div className="flex items-start justify-between">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-3/4" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-11 w-44 rounded-2xl" />
          <Skeleton className="h-11 w-32 rounded-2xl" />
        </div>
      </Card>
    </SkeletonGroup>
  );
}

/** "Find us in Cavite": the grid of branch cards. */
export function BranchGridSkeleton({ className = '' }: { className?: string }) {
  return (
    <SkeletonGroup label="Loading branches…" className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>
      {Array.from({ length: 6 }, (_, i) => (
        <Card key={i} className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-10 w-32 rounded-2xl" />
        </Card>
      ))}
    </SkeletonGroup>
  );
}
