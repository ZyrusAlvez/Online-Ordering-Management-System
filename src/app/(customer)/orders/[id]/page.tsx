import type { Metadata } from 'next';
import { RequireRole } from '@/view/components/guards';
import OrderDetail from '@/view/presentation/customer/OrderDetail';

export const metadata: Metadata = { title: 'Order' };

export default function Page() {
  return (
    <RequireRole roles={['customer']}>
      <OrderDetail />
    </RequireRole>
  );
}
