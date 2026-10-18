'use client';

import { useEffect } from 'react';
import { Logo } from '@/view/components/Logo';
import { Button } from '@/view/components/ui';

/** Shown instead of a blank screen when a page crashes. "Try again" re-renders just that page. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-cream px-6 text-center">
      <Logo to={null} size={64} text={false} />
      <div className="space-y-2">
        <h1 className="font-display text-3xl text-ink">Something went wrong</h1>
        <p className="max-w-sm text-ink-soft">
          This page hit an unexpected problem. Your cart and any placed orders are safe.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button tone="ghost" href="/">
          Go to the home page
        </Button>
      </div>
    </main>
  );
}
