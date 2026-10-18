'use client';

import { SuperOnly } from '@/view/presentation/admin/AdminApp';
import AdminAdmins from '@/view/presentation/admin/AdminAdmins';

export default function Page() {
  return (
    <SuperOnly>
      <AdminAdmins />
    </SuperOnly>
  );
}
