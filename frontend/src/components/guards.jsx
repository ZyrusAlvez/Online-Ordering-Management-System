import { Navigate, useLocation } from 'react-router-dom';
import { HOME_FOR_ROLE, useAuth } from '../context/AuthContext.jsx';
import { Button, Card } from './ui.jsx';

/**
 * Client-side routing guard. It only chooses what to render — the API checks
 * the role again on every request, so this is not the security boundary.
 */
export function RequireRole({ roles, children }) {
  const { isAuthed, role, logout } = useAuth();
  const location = useLocation();

  if (!isAuthed) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;

  if (!roles.includes(role)) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
        <Card className="w-full text-center">
          <h1 className="font-display text-3xl">Wrong account</h1>
          <p className="mt-2 text-sm text-ink-soft">
            You're signed in as a {role ?? 'user'}, which can't open this page.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Button to={HOME_FOR_ROLE[role] ?? '/'} tone="outline">Go to my page</Button>
            <Button tone="dark" onClick={logout}>
              Sign out
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return children;
}
