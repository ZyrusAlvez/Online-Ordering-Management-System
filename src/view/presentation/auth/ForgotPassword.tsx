'use client';

import { useState } from 'react';
import { Link, Navigate } from '@/utils/navigation';
import { HOME_FOR_ROLE, useAuth } from '@/context/AuthContext';
import { requestPasswordReset } from '@/controllers/authController';
import { call } from '@/utils/apiError';
import { Logo } from '@/view/components/Logo';
import { Button, Card, ErrorNote, Field, Input } from '@/view/components/ui';

export default function ForgotPassword() {
  const { isAuthed, role } = useAuth();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Signed in already: the password is changed from Profile instead.
  if (isAuthed) return <Navigate to={HOME_FOR_ROLE[role] ?? '/menu'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await call(requestPasswordReset(email.trim()));
      setSentTo(email.trim());
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 py-10">
      <Logo size={56} />
      <Card className="mt-8 w-full max-w-md p-7">
        {sentTo ? (
          <div className="text-center">
            <h1 className="font-display text-4xl">Check your email</h1>
            <p className="mt-3 text-sm text-ink-soft">
              If <strong>{sentTo}</strong> has an account, we sent it a link to choose a new password. The link
              works once and expires in an hour.
            </p>
            <p className="mt-3 text-sm text-ink-soft">Nothing there? Check your spam folder, or send it again.</p>
            <div className="mt-6 flex justify-center gap-3">
              <Button tone="outline" onClick={() => setSentTo(null)}>Send again</Button>
              <Button to="/login">Back to log in</Button>
            </div>
          </div>
        ) : (
          <>
            <h1 className="font-display text-4xl">Forgot password</h1>
            <p className="mt-3 text-sm text-ink-soft">
              Enter the email you signed up with and we'll send you a link to choose a new password.
            </p>
            <form onSubmit={submit} className="mt-6 space-y-4">
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
                Send reset link
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
