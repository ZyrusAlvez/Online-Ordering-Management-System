import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Button, Card, ErrorNote, Field, Input } from '../../components/ui.jsx';
import { Lock } from '../../components/icons.jsx';
import { BranchSelect, useStaffBranch } from '../../components/StaffBranch.jsx';

function PasswordCard({ role, title, description, branch }) {
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
      await api.put(`/admin/employee-passwords/${role}`, { branch_id: branch.id, password }, { auth: true });
      toast.success(`${branch.name} ${title.toLowerCase()} password updated`);
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
  const { branchId: viewing, branches } = useStaffBranch();
  // Passwords are per branch, so this page always works on exactly one.
  const [picked, setPicked] = useState('');
  const branchId = picked || viewing || branches[0]?.id || '';
  const branch = branches.find((b) => b.id === branchId);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl">Employee passwords</h1>
      <p className="max-w-2xl text-sm text-ink-soft">
        Each branch has its own passwords for the <strong>/cashier</strong> and <strong>/kiosk</strong> pages.
        Staff choose their branch, then type its password. Share them only with that branch's staff.
        Changing the cashier password signs out nobody already using the register, but the new password is
        required next time.
      </p>
      {branches.length > 1 && (
        <div className="max-w-xs">
          <BranchSelect value={branchId} onChange={setPicked} />
        </div>
      )}
      {branch && (
        <div className="grid gap-4 lg:grid-cols-2">
          <PasswordCard
            key={`cashier-${branch.id}`}
            role="cashier"
            title="Cashier"
            branch={branch}
            description={`Unlocks the register at /cashier for ${branch.name}. Setting it the first time creates the branch's register login.`}
          />
          <PasswordCard
            key={`kiosk-${branch.id}`}
            role="kiosk"
            title="Kiosk"
            branch={branch}
            description={`Unlocks a browser as a ${branch.name} self-order kiosk at /kiosk. Kiosks already unlocked keep working until you revoke their device.`}
          />
        </div>
      )}
    </div>
  );
}
