'use client';

import { useEffect, useState } from 'react';
import { useNavigate } from '@/utils/navigation';
import { HOME_FOR_ROLE } from '@/context/AuthContext';
import { finishGoogleLogin, getSession, roleOf } from '@/controllers/authController';
import { Logo } from '@/view/components/Logo';
import GoogleButton from '@/view/components/GoogleButton';
import { Button, Card, ErrorNote, PageLoader } from '@/view/components/ui';

/** Where Google sends the browser back to. Finishes sign-in, then moves on. */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    // Already signed in: this is a reload of, or Back to, a callback that was used.
    // Its code is spent, so do not try it again; just carry on.
    getSession().then((current) => {
    if (current?.access_token) {
      navigate(HOME_FOR_ROLE[roleOf(current)] ?? '/menu', { replace: true });
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const denied = params.get('error_description') ?? params.get('error');

    if (denied || !code) {
      setError(new Error(denied ?? 'Google sign-in did not complete. Please try again.'));
      return;
    }

    finishGoogleLogin(code).then((result) => {
      if (result.success === false) {
        setError(new Error(result.error));
        return;
      }
      const { session, next } = result.data;
      const role = roleOf(session);
      // Only customers return to where they were headed; staff go to their own page.
      navigate(role === 'customer' && next ? next : (HOME_FOR_ROLE[role] ?? '/menu'), { replace: true });
    });
    });
  }, [navigate]);

  if (!error) return <PageLoader label="Signing you in…" />;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 py-10">
      <Logo size={56} />
      <Card className="mt-8 w-full max-w-md space-y-4 p-7">
        <h1 className="font-display text-3xl">Couldn't sign you in</h1>
        <ErrorNote error={error} />
        <GoogleButton onError={setError} />
        <Button to="/login" tone="outline" size="lg" className="w-full">Back to log in</Button>
      </Card>
    </div>
  );
}
