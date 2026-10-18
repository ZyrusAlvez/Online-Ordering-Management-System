import type { Metadata } from 'next';
import PrivacyPolicy from '@/view/presentation/legal/PrivacyPolicy';

export const metadata: Metadata = { title: 'Privacy Policy' };

export default function Page() {
  return <PrivacyPolicy />;
}
