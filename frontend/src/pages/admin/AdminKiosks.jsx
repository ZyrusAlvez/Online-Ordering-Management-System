import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { dateTime, timeAgo } from '../../lib/format.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Badge, Button, Empty, ErrorNote, Field, Input, Modal, PageLoader } from '../../components/ui.jsx';
import { Plus } from '../../components/icons.jsx';
import { BranchSelect, useStaffBranch } from '../../components/StaffBranch.jsx';

function IssueKiosk({ onClose, onIssued }) {
  const toast = useToast();
  const { branchId: viewing, branches } = useStaffBranch();
  const [name, setName] = useState('');
  const [branchId, setBranchId] = useState(viewing || (branches.length === 1 ? branches[0].id : ''));
  const [issued, setIssued] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post('/admin/kiosks', { name: name.trim(), branch_id: branchId }, { auth: true });
      setIssued(data);
      onIssued();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued.key);
      toast.success('Key copied');
    } catch {
      toast.error('Could not copy — select the key and copy it manually.');
    }
  };

  return (
    <Modal open onClose={onClose} title={issued ? 'Device key' : 'New kiosk device'}>
      {issued ? (
        <div className="space-y-4">
          <p className="rounded-2xl bg-amber-100 p-3 text-sm text-amber-900">{issued.warning}</p>
          <code className="block break-all rounded-2xl bg-ink p-4 text-sm text-cream">{issued.key}</code>
          <div className="flex gap-3">
            <Button className="flex-1" onClick={copy}>Copy key</Button>
            <Button tone="outline" onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-ink-soft">
            Kiosks normally register themselves with the employee password. Issue a key manually only
            if you need to set one up by hand.
          </p>
          <BranchSelect value={branchId} onChange={setBranchId} />
          <Field label="Device name"><Input required autoFocus maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Front counter kiosk" /></Field>
          <ErrorNote error={error} />
          <Button type="submit" size="lg" className="w-full" loading={busy}>Issue key</Button>
        </form>
      )}
    </Modal>
  );
}

export default function AdminKiosks() {
  const toast = useToast();
  const { branchId, query: branchQuery } = useStaffBranch();
  const [issuing, setIssuing] = useState(false);
  const { data, error, loading, reload, refresh } = useFetch(
    () => api.get('/admin/kiosks', { auth: true, query: branchQuery }),
    [branchId],
  );

  const revoke = async (device) => {
    if (!window.confirm(`Revoke "${device.name}"? That kiosk will be locked out.`)) return;
    try {
      await api.del(`/admin/kiosks/${device.id}`, { auth: true });
      toast.success('Device revoked');
      refresh();
    } catch (err) {
      toast.error(err.friendly);
    }
  };

  const devices = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <h1 className="font-display text-4xl">Kiosks</h1>
        <Button onClick={() => setIssuing(true)}><Plus size={16} /> Issue key</Button>
      </div>
      <ErrorNote error={error} onRetry={reload} />
      {loading && !data && <PageLoader />}
      {!loading && !error && devices.length === 0 && (
        <Empty title="No kiosk devices" hint="A kiosk registers here the first time it is unlocked with its branch's employee password." />
      )}
      <div className="space-y-2">
        {devices.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-paper p-4">
            <div>
              <p className="font-bold">{d.name}</p>
              <p className="text-xs text-ink-soft">
                {d.branch?.name ?? 'No branch'} · <code>{d.key_prefix}…</code> · created {dateTime(d.created_at)} ·{' '}
                {d.last_seen_at ? `last seen ${timeAgo(d.last_seen_at)}` : 'never used'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={d.is_active ? 'green' : 'gray'}>{d.is_active ? 'Active' : 'Revoked'}</Badge>
              {d.is_active && <Button tone="danger" size="sm" onClick={() => revoke(d)}>Revoke</Button>}
            </div>
          </div>
        ))}
      </div>
      {issuing && <IssueKiosk onClose={() => setIssuing(false)} onIssued={refresh} />}
    </div>
  );
}
