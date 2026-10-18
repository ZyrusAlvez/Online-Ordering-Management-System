import { redirect } from 'next/navigation';

// Unknown paths go home, as the old router's catch-all did.
export default function NotFound() {
  redirect('/');
}
