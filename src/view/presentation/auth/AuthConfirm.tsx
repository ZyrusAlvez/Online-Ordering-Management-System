'use client';

import { useEffect, useState } from 'react';
import { useNavigate } from '@/utils/navigation';
import { HOME_FOR_ROLE } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { confirmEmailLink, roleOf } from '@/controllers/authController';
import { Logo } from '@/view/components/Logo';
import { Button, Card, ErrorNote, PageLoader } from '@/view/components/ui';

/** Where the confirm-signup and reset-password emails link to. Checks the link, then moves on. */
export default function AuthConfirm() {
  const navigate = useNavigate();
  const toast = useToast();
  const [failed, setFailed] = useState<{ error: Error; recovery: boolean } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('type');
    confirmEmailLink(params.get('token_hash'), type).then((result) => {
      if (result.success === false) {
        setFailed({ error: new Error(result.error), recovery: type === 'recovery' });
        return;
      }
      const { session, recovery } = result.data;
      if (recovery) {
        navigate('/reset-password', { replace: true });
        return;
      }
      toast.success('Email confirmed. Welcome!');
      navigate(HOME_FOR_ROLE[roleOf(session)] ?? '/menu', { replace: true });
    });
  }, [navigate, toast]);

  if (!failed) return <PageLoader label="Checking your link…" />;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 py-10">
      <Logo size={56} />
      <Card className="mt-8 w-full max-w-md space-y-4 p-7">
        <h1 className="font-display text-3xl">That link didn't work</h1>
        <ErrorNote error={failed.error} />
        <p className="text-sm text-ink-soft">
          {failed.recovery
            ? 'Reset links work once and expire after an hour. Ask for a new one.'
            : 'If you already confirmed your email, just log in.'}
        </p>
        {failed.recovery && (
          <Button to="/forgot-password" size="lg" className="w-full">Send a new link</Button>
        )}
        <Button to="/login" tone={failed.recovery ? 'outline' : 'primary'} size="lg" className="w-full">
          Go to log in
        </Button>
      </Card>
    </div>
  );
}
