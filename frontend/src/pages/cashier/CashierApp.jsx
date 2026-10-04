import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { Logo } from '../../components/Logo.jsx';
import { Button, Card, ErrorNote, Field, Input } from '../../components/ui.jsx';
import { Lock } from '../../components/icons.jsx';
import Pos from './Pos.jsx';

function CashierGate() {
  const { loginCashier } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await loginCashier(password);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4">
      <Logo size={64} />
      <Card className="mt-8 w-full max-w-sm p-7">
        <div className="mb-4 flex items-center gap-3">
          <span className="rounded-2xl bg-ink p-3 text-cream">
            <Lock />
          </span>
          <div>
            <h1 className="font-display text-3xl leading-none">Cashier</h1>
            <p className="text-xs text-ink-soft">Employee password required</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Employee password">
            <Input
              type="password"
              autoFocus
              required
              autoComplete="off"
              maxLength={200}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <ErrorNote error={error} />
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            Open register
          </Button>
        </form>
      </Card>
    </div>
  );
}

export default function CashierApp() {
  const { isAuthed, role } = useAuth();
  // Admins may also use the register; any other signed-in role still gets the gate.
  if (isAuthed && ['cashier', 'admin'].includes(role)) return <Pos />;
  return <CashierGate />;
}
