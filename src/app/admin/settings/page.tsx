import type { Metadata } from 'next';
import AdminSettings from '@/view/presentation/admin/AdminSettings';

export const metadata: Metadata = { title: 'Employee passwords · Admin' };

export default function Page() {
  return <AdminSettings />;
}
