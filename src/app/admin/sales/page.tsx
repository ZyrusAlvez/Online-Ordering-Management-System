import type { Metadata } from 'next';
import AdminSales from '@/view/presentation/admin/AdminSales';

export const metadata: Metadata = { title: 'Sales · Admin' };

export default function Page() {
  return <AdminSales />;
}
