'use client';

import { RequireRole } from '@/view/components/guards';
import Driver from '@/view/presentation/driver/Driver';

export default function Page() {
  return (
    <RequireRole roles={['rider']}>
      <Driver />
    </RequireRole>
  );
}
