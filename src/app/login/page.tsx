import type { Metadata } from 'next';
import Login from '@/view/presentation/auth/Login';

export const metadata: Metadata = { title: 'Log in' };

export default function Page() {
  return <Login />;
}
