import type { Metadata } from 'next';
import { SuperOnly } from '@/view/presentation/admin/AdminApp';
import AdminAdmins from '@/view/presentation/admin/AdminAdmins';

export const metadata: Metadata = { title: 'Admins · Admin' };

export default function Page() {
  return (
    <SuperOnly>
      <AdminAdmins />
    </SuperOnly>
  );
}
