import type { Metadata } from 'next';
import Terms from '@/view/presentation/legal/Terms';

export const metadata: Metadata = { title: 'Terms of Service' };

export default function Page() {
  return <Terms />;
}
