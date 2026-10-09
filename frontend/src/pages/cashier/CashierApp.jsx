import { useState } from 'react';
import { ADMIN_ROLES, useAuth } from '../../context/AuthContext.jsx';
import { useBranches } from '../../lib/branches.js';
import { Logo } from '../../components/Logo.jsx';
import { Button, Card, ErrorNote, Field, Input, Select } from '../../components/ui.jsx';
import { Lock } from '../../components/icons.jsx';
import Pos from './Pos.jsx';

// The register remembers its branch, so staff only type the password each shift.
const BRANCH_KEY = '3k.registerBranch';
const rememberedBranch = () => {
  try {
    return localStorage.getItem(BRANCH_KEY) ?? '';
  } catch {
    return '';
  }
};

function CashierGate() {
  const { loginCashier } = useAuth();
  const { branches } = useBranches();
  const [picked, setPicked] = useState(rememberedBranch);
  const branchId = branches.some((b) => b.id === picked) ? picked : '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      try {
        localStorage.setItem(BRANCH_KEY, branchId);
      } catch {
        // not remembered; they pick it again next time
      }
      await loginCashier(branchId, password);
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
          <Field label="Branch">
            <Select required value={branchId} onChange={(e) => setPicked(e.target.value)}>
              <option value="" disabled>
                Choose this register's branch
              </option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
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
  if (isAuthed && ['cashier', ...ADMIN_ROLES].includes(role)) return <Pos />;
  return <CashierGate />;
}
