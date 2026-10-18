'use client';

import { RequireRole } from '@/view/components/guards';
import Checkout from '@/view/presentation/customer/Checkout';

export default function Page() {
  return (
    <RequireRole roles={['customer']}>
      <Checkout />
    </RequireRole>
  );
}
