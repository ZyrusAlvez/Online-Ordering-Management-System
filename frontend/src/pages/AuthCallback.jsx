import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HOME_FOR_ROLE } from '../context/AuthContext.jsx';
import { finishGoogleSignIn } from '../lib/oauth.js';
import { roleOf } from '../lib/session.js';
import { Logo } from '../components/Logo.jsx';
import { Button, Card, ErrorNote, PageLoader } from '../components/ui.jsx';

/** Where Google sends the browser back to. Finishes sign-in, then moves on. */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const denied = params.get('error_description') ?? params.get('error');

    if (denied || !code) {
      setError(new Error(denied ?? 'Google sign-in did not complete. Please try again.'));
      return;
    }

    finishGoogleSignIn(code).then(
      ({ session, next }) => {
        const role = roleOf(session);
        // Only customers return to where they were headed; staff go to their own page.
        navigate(role === 'customer' && next ? next : (HOME_FOR_ROLE[role] ?? '/menu'), { replace: true });
      },
      (err) => setError(err),
    );
  }, [navigate]);

  if (!error) return <PageLoader label="Signing you in…" />;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 py-10">
      <Logo size={56} />
      <Card className="mt-8 w-full max-w-md space-y-4 p-7">
        <h1 className="font-display text-3xl">Couldn't sign you in</h1>
        <ErrorNote error={error} />
        <Button to="/login" size="lg" className="w-full">Back to log in</Button>
      </Card>
    </div>
  );
}
