import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Button, Card, ErrorNote, Field, Input } from '../../components/ui.jsx';
import { Lock } from '../../components/icons.jsx';

function PasswordCard({ role, title, description }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const mismatch = confirm && password !== confirm;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.put(`/admin/employee-passwords/${role}`, { password }, { auth: true });
      toast.success(`${title} password updated`);
      setPassword('');
      setConfirm('');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-ink p-3 text-cream"><Lock /></span>
          <div>
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="text-sm text-ink-soft">{description}</p>
          </div>
        </div>
        <Field label="New password" hint="At least 6 characters">
          <Input type="password" required minLength={6} maxLength={200} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm password" error={mismatch ? 'Passwords do not match' : undefined}>
          <Input type="password" required maxLength={200} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <ErrorNote error={error} />
        <Button type="submit" loading={busy} disabled={!password || password !== confirm}>
          Update {title.toLowerCase()} password
        </Button>
      </form>
    </Card>
  );
}

export default function AdminSettings() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl">Employee passwords</h1>
      <p className="max-w-2xl text-sm text-ink-soft">
        These passwords protect the <strong>/cashier</strong> and <strong>/kiosk</strong> pages. Share
        them only with staff. Changing the cashier password signs out nobody already using the
        register, but the new password is required next time.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <PasswordCard
          role="cashier"
          title="Cashier"
          description="Unlocks the register at /cashier."
        />
        <PasswordCard
          role="kiosk"
          title="Kiosk"
          description="Unlocks a browser as a self-order kiosk at /kiosk. Kiosks already unlocked keep working until you revoke their device."
        />
      </div>
    </div>
  );
}
