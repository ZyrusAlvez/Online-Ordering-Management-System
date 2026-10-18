'use client';

import { Skeleton, SkeletonGroup } from '@/view/components/ui';

// Placeholders for shared components, shaped like what they stand in for, so the page keeps its
// layout while only the data loads. Feature screens keep theirs in their own SkeletonLoading.tsx.

/** The menu: category tabs, then a grid of dish cards (MenuBrowser). */
export function MenuSkeleton({ big = false, list = false }: { big?: boolean; list?: boolean }) {
  if (list) {
    return (
      <SkeletonGroup label="Loading the menu…" className="space-y-4 pt-2">
        <Skeleton className="h-11 w-full rounded-2xl" />
        <Skeleton className="h-6 w-36" />
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-3">
              <Skeleton className="h-4 flex-1" style={{ maxWidth: `${55 + ((i * 17) % 35)}%` }} />
              <Skeleton className="ml-auto h-4 w-16" />
            </div>
          ))}
        </div>
      </SkeletonGroup>
    );
  }
  return (
    <SkeletonGroup label="Loading the menu…" className="space-y-5">
      <Skeleton className={`w-full rounded-2xl ${big ? 'h-14' : 'h-11'}`} />
      <div className="flex gap-2 overflow-hidden">
        {[4, 6, 7, 6, 6.5, 7.5].map((rem, i) => (
          <Skeleton key={i} className={`shrink-0 rounded-full ${big ? 'h-12' : 'h-8'}`} style={{ width: `${rem}rem` }} />
        ))}
      </div>
      <Skeleton className="h-7 w-40" />
      <div className={`grid gap-3 ${big ? 'grid-cols-2 gap-5 xl:grid-cols-3' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4'}`}>
        {Array.from({ length: big ? 6 : 8 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-line bg-paper">
            <Skeleton className={`w-full rounded-none ${big ? 'h-44' : 'h-28 sm:h-32'}`} />
            <div className={`space-y-2 ${big ? 'p-4' : 'p-3'}`}>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}

/** A conversation: alternating message bubbles. */
export function ChatSkeleton() {
  return (
    <SkeletonGroup label="Loading messages…" className="space-y-3 py-4">
      {['w-2/3', 'ml-auto w-1/2', 'w-3/5', 'ml-auto w-2/5'].map((w, i) => (
        <Skeleton key={i} className={`h-10 rounded-2xl ${w}`} />
      ))}
    </SkeletonGroup>
  );
}

/** Rows of "name / details" on the left and a badge and button on the right (riders, admins, kiosks). */
export function RowsSkeleton({ count = 4, label = 'Loading…' }: { count?: number; label?: string }) {
  return (
    <SkeletonGroup label={label} className="space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-paper p-4">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-2/3 max-w-sm" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-xl" />
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** A map that is still loading its library or tiles. */
export function MapSkeleton({ className = '' }: { className?: string }) {
  return <Skeleton className={`rounded-3xl ${className}`} />;
}
