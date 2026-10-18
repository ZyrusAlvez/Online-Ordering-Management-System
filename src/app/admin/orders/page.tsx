import type { Metadata } from 'next';
import AdminOrders from '@/view/presentation/admin/AdminOrders';

export const metadata: Metadata = { title: 'Orders · Admin' };

export default function Page() {
  return <AdminOrders />;
}
