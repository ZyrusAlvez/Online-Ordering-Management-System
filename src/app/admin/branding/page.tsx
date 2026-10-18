'use client';

import { SuperOnly } from '@/view/presentation/admin/AdminApp';
import AdminBranding from '@/view/presentation/admin/AdminBranding';

export default function Page() {
  return (
    <SuperOnly>
      <AdminBranding />
    </SuperOnly>
  );
}
