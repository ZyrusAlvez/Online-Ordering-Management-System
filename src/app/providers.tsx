'use client';

import { Suspense, useEffect, useState } from 'react';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { PageLoader } from '@/view/components/ui';

/**
 * Client-side providers shared by every page.
 *
 * The screens read the browser's storage while rendering (the session, the cart, the chosen
 * branch, the kiosk key), which the server cannot see, so a server-rendered page would differ
 * from the browser's first render (React hydration error #418). They render in the browser only,
 * like the single-page app they came from; the server sends the loader.
 *
 * The Suspense boundary is what Next.js needs around screens that read the URL's query string.
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <PageLoader />;

  return (
    <ToastProvider>
      <AuthProvider>
        <Suspense fallback={<PageLoader />}>{children}</Suspense>
      </AuthProvider>
    </ToastProvider>
  );
}
