import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { HOME_FOR_ROLE, useAuth } from '../context/AuthContext.jsx';
import GoogleButton, { OrDivider } from '../components/GoogleButton.jsx';
import { Logo } from '../components/Logo.jsx';
import { Button, Card, ErrorNote, Field, Input } from '../components/ui.jsx';

export default function Register() {
  const { isAuthed, role, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  if (isAuthed) return <Navigate to={HOME_FOR_ROLE[role] ?? '/menu'} replace />;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await register({
        email: form.email.trim(),
        password: form.password,
        fullName: form.fullName.trim() || undefined,
      });
      if (result.session) navigate('/menu', { replace: true });
      else setNeedsConfirm(true);
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
        {needsConfirm ? (
          <div className="text-center">
            <h1 className="font-display text-4xl">Check your email</h1>
            <p className="mt-3 text-sm text-ink-soft">
              We sent a confirmation link to <strong>{form.email}</strong>. Open it, then log in.
            </p>
            <Button to="/login" className="mt-6">Go to log in</Button>
          </div>
        ) : (
          <>
            <h1 className="font-display text-4xl">
              Create account
            </h1>
            <div className="mt-6">
              <GoogleButton onError={setError} />
              <OrDivider />
            </div>
            <form onSubmit={submit} className="space-y-4">
              <Field label="Full name">
                <Input maxLength={120} value={form.fullName} onChange={set('fullName')} autoComplete="name" />
              </Field>
              <Field label="Email">
                <Input type="email" required maxLength={254} value={form.email} onChange={set('email')} autoComplete="email" />
              </Field>
              <Field label="Password" hint="At least 8 characters">
                <Input
                  type="password"
                  required
                  minLength={8}
                  maxLength={72}
                  value={form.password}
                  onChange={set('password')}
                  autoComplete="new-password"
                />
              </Field>
              <ErrorNote error={error} />
              <Button type="submit" size="lg" className="w-full" loading={busy}>
                Sign up
              </Button>
            </form>
            <p className="mt-5 text-center text-sm text-ink-soft">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-brand hover:underline">
                Log in
              </Link>
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
