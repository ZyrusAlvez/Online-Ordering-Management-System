import type { Metadata } from 'next';
import AdminRiders from '@/view/presentation/admin/AdminRiders';

export const metadata: Metadata = { title: 'Riders · Admin' };

export default function Page() {
  return <AdminRiders />;
}
