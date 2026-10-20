'use client';

import { useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { confirmSignupCode, resendSignupCode } from '@/controllers/authController';
import { RESEND_SECONDS } from '@/constants/auth';
import { useCooldown } from '@/hooks/hooks';
import { call } from '@/utils/apiError';
import { Button, CodeInput, ErrorNote, Field } from '@/view/components/ui';

/**
 * Asks for the code from the confirm-signup email. A right code signs the customer in, and the
 * screen around this (Register, Login) moves on by itself once the session appears. `justSent`:
 * a code went out a moment ago (Register), so Resend starts counting down.
 */
export default function ConfirmEmailCode({ email, intro, onBack, justSent = false }: any) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const cooldown = useCooldown(RESEND_SECONDS, justSent);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await call(confirmSignupCode(email, code));
      toast.success('Email confirmed. Welcome!');
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    try {
      await call(resendSignupCode(email));
      cooldown.start();
      toast.success('New code sent');
    } catch (err) {
      setError(err);
    } finally {
      setResending(false);
    }
  };

  return (
    <>
      <h1 className="font-display text-4xl">Check your email</h1>
      <p className="mt-3 text-sm text-ink-soft">
        {intro ?? 'We sent a 6-digit code to'} <strong>{email}</strong>. Enter it below to finish signing up.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Code" hint="Nothing there? Check your spam folder.">
          <CodeInput required autoFocus value={code} onChange={setCode} />
        </Field>
        <ErrorNote error={error} />
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={code.length !== 6}>
          Confirm email
        </Button>
      </form>
      <div className="mt-5 flex items-center justify-between text-sm">
        <button type="button" onClick={onBack} className="text-ink-soft hover:text-ink">
          ← Change email
        </button>
        <button
          type="button"
          onClick={resend}
          disabled={resending || cooldown.left > 0}
          className="font-semibold text-brand hover:underline disabled:text-ink-soft disabled:no-underline"
        >
          {resending ? 'Sending…' : cooldown.left > 0 ? `Resend code in ${cooldown.left}s` : 'Resend code'}
        </button>
      </div>
    </>
  );
}
