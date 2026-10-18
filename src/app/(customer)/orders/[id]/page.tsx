'use client';

import { RequireRole } from '@/view/components/guards';
import OrderDetail from '@/view/presentation/customer/OrderDetail';

export default function Page() {
  return (
    <RequireRole roles={['customer']}>
      <OrderDetail />
    </RequireRole>
  );
}
