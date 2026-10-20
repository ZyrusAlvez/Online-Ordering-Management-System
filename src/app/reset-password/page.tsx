import type { Metadata } from 'next';
import ResetPassword from '@/view/presentation/auth/ResetPassword';

export const metadata: Metadata = { title: 'New password' };

export default function Page() {
  return <ResetPassword />;
}
