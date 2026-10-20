import type { Metadata } from 'next';
import ForgotPassword from '@/view/presentation/auth/ForgotPassword';

export const metadata: Metadata = { title: 'Forgot password' };

export default function Page() {
  return <ForgotPassword />;
}
