'use client';

import { RequireRole } from '@/view/components/guards';
import Profile from '@/view/presentation/customer/Profile';

export default function Page() {
  return (
    <RequireRole roles={['customer']}>
      <Profile />
    </RequireRole>
  );
}
