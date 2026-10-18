'use client';

import { SuperOnly } from '@/view/presentation/admin/AdminApp';
import AdminBranches from '@/view/presentation/admin/AdminBranches';

export default function Page() {
  return (
    <SuperOnly>
      <AdminBranches />
    </SuperOnly>
  );
}
