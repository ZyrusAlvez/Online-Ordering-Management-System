import type { Metadata } from 'next';
import Menu from '@/view/presentation/customer/Menu';

export const metadata: Metadata = { title: 'Menu' };

export default function Page() {
  return <Menu />;
}
