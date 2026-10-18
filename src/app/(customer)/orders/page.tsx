import type { Metadata } from 'next';
import { RequireRole } from '@/view/components/guards';
import Orders from '@/view/presentation/customer/Orders';

export const metadata: Metadata = { title: 'My orders' };

export default function Page() {
  return (
    <RequireRole roles={['customer']}>
      <Orders />
    </RequireRole>
  );
}
