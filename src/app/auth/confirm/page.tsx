import type { Metadata } from 'next';
import AuthConfirm from '@/view/presentation/auth/AuthConfirm';

export const metadata: Metadata = { title: 'Checking your link' };

export default function Page() {
  return <AuthConfirm />;
}
