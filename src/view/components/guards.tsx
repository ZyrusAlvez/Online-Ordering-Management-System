'use client';

import { Navigate, useLocation } from '@/utils/navigation';
import { HOME_FOR_ROLE, useAuth } from '@/context/AuthContext';
import { Button, Card } from '@/view/components/ui';

/**
 * Client-side routing guard. It only chooses what to render: Supabase RLS and the
 * server actions check the role again on every request, so this is not the security boundary.
 */
export function RequireRole({ roles, children }: any) {
  const { isAuthed, role, logout, ready } = useAuth();
  const location = useLocation();

  // The stored session is read asynchronously (a moment); render nothing rather than bounce a signed-in user.
  if (!ready) return null;

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
