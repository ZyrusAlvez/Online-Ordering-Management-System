'use client';

import { useEffect, useState } from 'react';
import { Link, Navigate, forgetFrom, useLocation, useNavigate } from '@/utils/navigation';
import { HOME_FOR_ROLE, useAuth } from '@/context/AuthContext';
import { roleOf } from '@/controllers/authController';
import GoogleButton, { OrDivider } from '@/view/components/GoogleButton';
import { Logo } from '@/view/components/Logo';
import { Button, Card, ErrorNote, Field, Input, PasswordInput } from '@/view/components/ui';

export default function Login() {
  const { isAuthed, role, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from;
  // `from` lasted one navigation in react-router; here it is kept until this screen is left.
  useEffect(() => () => forgetFrom(), []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Only customers go back to where they were headed; a rider who got bounced from
  // /checkout lands on their own page rather than a "Wrong account" screen.
  if (isAuthed) {
    return <Navigate to={role === 'customer' && from ? from : (HOME_FOR_ROLE[role] ?? '/menu')} replace />;
  }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await login(email.trim(), password);
      const next = roleOf(result);
      // Only honour `from` for customers; staff always land on their own page.
      navigate(next === 'customer' && from ? from : (HOME_FOR_ROLE[next] ?? '/menu'), {
        replace: true,
      });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 py-10">
      <Logo size={56} />
      <Card className="mt-8 w-full max-w-md p-7">
        <h1 className="font-display text-4xl">
          Welcome back
        </h1>
        <p className="mt-3 text-sm text-ink-soft">
          Customers, drivers and admins sign in here — you'll be taken to the right page.
        </p>
        <div className="mt-6">
          <GoogleButton next={from} onError={setError} />
          <OrDivider />
        </div>
        <form onSubmit={submit} className="space-y-4">
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
          <Field label="Password">
            <PasswordInput
              autoComplete="current-password"
              required
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {/* Outside the Field: a link inside its <label> would also focus the input. */}
          <div className="-mt-2 text-right">
            <Link to="/forgot-password" className="text-sm font-semibold text-brand hover:underline">
              Forgot password?
            </Link>
          </div>
          <ErrorNote error={error} />
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            Log in
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-ink-soft">
          New here?{' '}
          <Link to="/register" className="font-semibold text-brand hover:underline">
            Create an account
          </Link>
        </p>
      </Card>
      <Link to="/" className="mt-6 text-sm text-ink-soft hover:text-ink">
        ← Back to home
      </Link>
    </div>
  );
}
