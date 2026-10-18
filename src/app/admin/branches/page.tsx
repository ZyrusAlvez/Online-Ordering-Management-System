import type { Metadata } from 'next';
import { SuperOnly } from '@/view/presentation/admin/AdminApp';
import AdminBranches from '@/view/presentation/admin/AdminBranches';

export const metadata: Metadata = { title: 'Branches · Admin' };

export default function Page() {
  return (
    <SuperOnly>
      <AdminBranches />
    </SuperOnly>
  );
}
