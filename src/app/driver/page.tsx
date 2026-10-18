import type { Metadata } from 'next';
import { RequireRole } from '@/view/components/guards';
import Driver from '@/view/presentation/driver/Driver';

export const metadata: Metadata = { title: 'Deliveries' };

export default function Page() {
  return (
    <RequireRole roles={['rider']}>
      <Driver />
    </RequireRole>
  );
}
