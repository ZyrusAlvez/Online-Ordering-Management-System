'use client';

import { RequireRole } from '@/view/components/guards';
import Orders from '@/view/presentation/customer/Orders';

export default function Page() {
  return (
    <RequireRole roles={['customer']}>
      <Orders />
    </RequireRole>
  );
}
