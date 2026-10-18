import type { Metadata } from 'next';
import AdminKiosks from '@/view/presentation/admin/AdminKiosks';

export const metadata: Metadata = { title: 'Kiosks · Admin' };

export default function Page() {
  return <AdminKiosks />;
}
