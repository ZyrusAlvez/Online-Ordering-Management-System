'use client';

import { CustomerLayout } from '@/view/components/Layouts';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <CustomerLayout>{children}</CustomerLayout>;
}
