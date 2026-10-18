import type { Metadata } from 'next';
import CashierApp from '@/view/presentation/cashier/CashierApp';

export const metadata: Metadata = { title: 'Cashier' };

export default function Page() {
  return <CashierApp />;
}
