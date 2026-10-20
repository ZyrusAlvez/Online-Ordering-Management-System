'use client';

import { useState } from 'react';
import { Navigate, useNavigate } from '@/utils/navigation';
import { HOME_FOR_ROLE, useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { isRecovering, setNewPassword } from '@/controllers/authController';
import { call } from '@/utils/apiError';
import { Logo } from '@/view/components/Logo';
import { Button, Card, ErrorNote, Field, PasswordInput } from '@/view/components/ui';

/** Reached from a reset-password email (via /auth/confirm), already signed in by the link. */
export default function ResetPassword() {
  const { session, isAuthed, role, ready } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ next: '', confirm: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return null;
  // Anyone else signed in changes their password from Profile, which asks for the current one.
  if (isAuthed && !isRecovering(session)) return <Navigate to={HOME_FOR_ROLE[role] ?? '/menu'} replace />;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const mismatch = form.confirm && form.next !== form.confirm;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await call(setNewPassword(form.next));
      toast.success('Password changed');
      navigate(HOME_FOR_ROLE[role] ?? '/menu', { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 py-10">
      <Logo size={56} />
      <Card className="mt-8 w-full max-w-md p-7">
        {!isAuthed ? (
          <div className="text-center">
            <h1 className="font-display text-4xl">Link needed</h1>
            <p className="mt-3 text-sm text-ink-soft">
              Open the reset link from your email to choose a new password, or ask for a new one.
            </p>
            <Button to="/forgot-password" className="mt-6">Send a reset link</Button>
          </div>
        ) : (
          <>
            <h1 className="font-display text-4xl">New password</h1>
            <p className="mt-3 text-sm text-ink-soft">
              Choose a new password for <strong>{session?.user.email}</strong>. You'll be signed out on other devices.
            </p>
            <form onSubmit={submit} className="mt-6 space-y-4">
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
                disabled={form.next.length < 8 || form.next !== form.confirm}
              >
                Save new password
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
