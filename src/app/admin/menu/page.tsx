import type { Metadata } from 'next';
import AdminMenu from '@/view/presentation/admin/AdminMenu';

export const metadata: Metadata = { title: 'Menu · Admin' };

export default function Page() {
  return <AdminMenu />;
}
