'use client';

import { useState } from 'react';
import { Link, Navigate, useNavigate } from '@/utils/navigation';
import { HOME_FOR_ROLE, useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { roleOf, setNewPassword, verifyResetCode } from '@/controllers/authController';
import { sendPasswordResetCode } from '@/controllers/server/accountActions';
import { RESEND_SECONDS } from '@/constants/auth';
import { useCooldown } from '@/hooks/hooks';
import { call } from '@/utils/apiError';
import { Logo } from '@/view/components/Logo';
import { Button, Card, CodeInput, ErrorNote, Field, Input, PasswordInput } from '@/view/components/ui';

/** Email → the 6-digit code from the reset email and a new password → signed in. */
export default function ForgotPassword() {
  const { isAuthed, role } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [form, setForm] = useState({ code: '', next: '', confirm: '' });
  // Set once the code is accepted: it works only once, so a retry only saves the password.
  const [verifiedHome, setVerifiedHome] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const cooldown = useCooldown(RESEND_SECONDS);

  // Signed in already: the password is changed from Profile instead. A right code signs the
  // user in too, so only the first step redirects.
  if (isAuthed && step === 'email') return <Navigate to={HOME_FOR_ROLE[role] ?? '/menu'} replace />;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const mismatch = form.confirm && form.next !== form.confirm;

  const sendCode = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await call(sendPasswordResetCode({ email: email.trim() }));
      cooldown.start();
      setStep('code');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    try {
      await call(sendPasswordResetCode({ email: email.trim() }));
      cooldown.start();
      toast.success('New code sent');
    } catch (err) {
      setError(err);
    } finally {
      setResending(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let home = verifiedHome;
      if (!home) {
        const session = await call(verifyResetCode(email.trim(), form.code));
        home = HOME_FOR_ROLE[roleOf(session)] ?? '/menu';
        setVerifiedHome(home);
      }
      await call(setNewPassword(form.next));
      toast.success('Password changed');
      navigate(home, { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 py-10">
      <Logo size={56} />
      <Card className="mt-8 w-full max-w-md p-7">
        {step === 'code' ? (
          <>
            <h1 className="font-display text-4xl">New password</h1>
            <p className="mt-3 text-sm text-ink-soft">
              We sent a 6-digit code to <strong>{email.trim()}</strong>. Enter it with your new password. You'll be
              signed out on other devices.
            </p>
            <form onSubmit={save} className="mt-6 space-y-4">
              <Field label="Code" hint={verifiedHome ? 'Code accepted' : 'Nothing there? Check your spam folder.'}>
                <CodeInput
                  required
                  autoFocus
                  disabled={Boolean(verifiedHome)}
                  value={form.code}
                  onChange={(code) => setForm((f) => ({ ...f, code }))}
                />
              </Field>
              <Field label="New password" hint="At least 8 characters">
                <PasswordInput
                  required
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  value={form.next}
                  onChange={set('next')}
                />
              </Field>
              <Field label="Confirm new password" error={mismatch ? 'Passwords do not match' : undefined}>
                <PasswordInput
                  required
                  maxLength={72}
                  autoComplete="new-password"
                  value={form.confirm}
                  onChange={set('confirm')}
                />
              </Field>
              <ErrorNote error={error} />
              <Button
                type="submit"
                size="lg"
                className="w-full"
                loading={busy}
                disabled={form.code.length !== 6 || form.next.length < 8 || form.next !== form.confirm}
              >
                Save new password
              </Button>
            </form>
            {!verifiedHome && (
              <div className="mt-5 flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setStep('email');
                    setError(null);
                  }}
                  className="text-ink-soft hover:text-ink"
                >
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
            )}
          </>
        ) : (
          <>
            <h1 className="font-display text-4xl">Forgot password</h1>
            <p className="mt-3 text-sm text-ink-soft">
              Enter the email you signed up with and we'll send you a 6-digit code to choose a new password.
            </p>
            <form onSubmit={sendCode} className="mt-6 space-y-4">
              <Field label="Email">
                <Input
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </Field>
              <ErrorNote error={error} />
              <Button type="submit" size="lg" className="w-full" loading={busy}>
                Send code
              </Button>
            </form>
            <p className="mt-5 text-center text-sm text-ink-soft">
              Remembered it?{' '}
              <Link to="/login" className="font-semibold text-brand hover:underline">
                Log in
              </Link>
            </p>
          </>
        )}
      </Card>
      <Link to="/" className="mt-6 text-sm text-ink-soft hover:text-ink">
        ← Back to home
      </Link>
    </div>
  );
}
