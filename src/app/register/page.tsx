import type { Metadata } from 'next';
import Register from '@/view/presentation/auth/Register';

export const metadata: Metadata = { title: 'Create an account' };

export default function Page() {
  return <Register />;
}
