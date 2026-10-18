import type { Metadata } from 'next';
import { RequireRole } from '@/view/components/guards';
import Checkout from '@/view/presentation/customer/Checkout';

export const metadata: Metadata = { title: 'Checkout' };

export default function Page() {
  return (
    <RequireRole roles={['customer']}>
      <Checkout />
    </RequireRole>
  );
}
