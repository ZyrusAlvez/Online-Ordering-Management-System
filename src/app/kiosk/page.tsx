import type { Metadata } from 'next';
import KioskApp from '@/view/presentation/kiosk/KioskApp';

export const metadata: Metadata = { title: 'Kiosk' };

export default function Page() {
  return <KioskApp />;
}
