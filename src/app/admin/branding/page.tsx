import type { Metadata } from 'next';
import { SuperOnly } from '@/view/presentation/admin/AdminApp';
import AdminBranding from '@/view/presentation/admin/AdminBranding';

export const metadata: Metadata = { title: 'Branding · Admin' };

export default function Page() {
  return (
    <SuperOnly>
      <AdminBranding />
    </SuperOnly>
  );
}
