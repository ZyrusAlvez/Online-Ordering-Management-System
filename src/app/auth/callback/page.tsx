import type { Metadata } from 'next';
import AuthCallback from '@/view/presentation/auth/AuthCallback';

export const metadata: Metadata = { title: 'Signing in' };

export default function Page() {
  return <AuthCallback />;
}
