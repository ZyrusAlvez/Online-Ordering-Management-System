import type { Metadata } from 'next';
import { RequireRole } from '@/view/components/guards';
import Profile from '@/view/presentation/customer/Profile';

export const metadata: Metadata = { title: 'Profile' };

export default function Page() {
  return (
    <RequireRole roles={['customer']}>
      <Profile />
    </RequireRole>
  );
}
