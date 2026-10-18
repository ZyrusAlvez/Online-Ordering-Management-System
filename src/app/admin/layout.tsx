'use client';

import { ADMIN_ROLES } from '@/context/AuthContext';
import { RequireRole } from '@/view/components/guards';
import AdminApp from '@/view/presentation/admin/AdminApp';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole roles={ADMIN_ROLES}>
      <AdminApp>{children}</AdminApp>
    </RequireRole>
  );
}
