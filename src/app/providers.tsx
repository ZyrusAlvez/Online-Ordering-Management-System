'use client';

import { Suspense } from 'react';
import { AuthProvider } from '@/context/AuthContext';
import { PageLoader } from '@/view/components/ui';

/**
 * Client-side providers shared by every page. The Suspense boundary is what Next.js needs
 * around screens that read the URL's query string (useSearchParams).
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </AuthProvider>
  );
}
