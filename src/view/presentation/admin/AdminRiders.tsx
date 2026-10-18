'use client';

import PhoneInput from '@/view/components/PhoneInput';
import { useState } from 'react';
import { call } from '@/utils/apiError';
import { createRider, listRiders, updateRider } from '@/controllers/server/staffActions';
import { accessToken } from '@/context/AuthContext';
import { useFetch } from '@/hooks/hooks';
import { dateTime } from '@/utils/format';
import { useToast } from '@/context/ToastContext';
import { Badge, Button, Empty, ErrorNote, Field, Input, Modal, PageLoader, Pagination } from '@/view/components/ui';
import { Plus } from '@/view/components/icons';
import { BranchSelect, useStaffBranch } from '@/view/components/StaffBranch';

function CreateRider({ onClose, onCreated }: any) {
  const toast = useToast();
  const { branchId, branches } = useStaffBranch();
  // A rider delivers for one branch: the one being viewed, else the admin's first.
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    branch_id: branchId || (branches.length === 1 ? branches[0].id : ''),
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await call(
        createRider(await accessToken(), {
          branch_id: form.branch_id,
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          password: form.password,
          ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        }),
        );
      toast.success('Rider account created');
      onCreated();
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="New rider">
      <form onSubmit={submit} className="space-y-4">
        <BranchSelect value={form.branch_id} onChange={(id) => setForm((f) => ({ ...f, branch_id: id }))} />
        <Field label="Full name"><Input required maxLength={120} autoComplete="off" value={form.full_name} onChange={set('full_name')} /></Field>
        <Field label="Email"><Input type="email" required maxLength={254} autoComplete="off" value={form.email} onChange={set('email')} /></Field>
        <Field label="Temporary password" hint="At least 8 characters. Share it with the rider.">
          <Input type="text" required minLength={8} maxLength={72} autoComplete="off" value={form.password} onChange={set('password')} />
        </Field>
        <PhoneInput label="Phone" value={form.phone} onChange={(phone) => setForm((f) => ({ ...f, phone }))} />
        <ErrorNote error={error} />
        <Button type="submit" size="lg" className="w-full" loading={busy}>Create rider</Button>
      </form>
    </Modal>
  );
}

export default function AdminRiders() {
  const toast = useToast();
  const { branchId, query: branchQuery } = useStaffBranch();
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const { data, error, loading, reload, refresh } = useFetch(
    async () => call(listRiders(await accessToken(), { page, limit: 20, ...branchQuery })),
    [page, branchId],
  );

  const toggle = async (rider) => {
    try {
      await call(updateRider(await accessToken(), rider.id, { is_active: !rider.is_active }));
      toast.success(rider.is_active ? 'Rider deactivated' : 'Rider activated');
      refresh();
    } catch (err) {
      toast.error(err.friendly);
    }
  };

  const riders = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <h1 className="font-display text-4xl">Riders</h1>
        <Button onClick={() => setCreating(true)}><Plus size={16} /> New rider</Button>
      </div>
      <ErrorNote error={error} onRetry={reload} />
      {loading && !data && <PageLoader />}
      {!loading && !error && riders.length === 0 && (
        <Empty title="No riders yet" hint="Create an account for each delivery rider." />
      )}
      <div className="space-y-2">
        {riders.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-paper p-4">
            <div>
              <p className="font-bold">{r.full_name || 'Unnamed rider'}</p>
              <p className="text-xs text-ink-soft">
                {r.branches?.map((b) => b.name).join(', ') || 'No branch'} · {r.phone || 'No phone'} · added{' '}
                {dateTime(r.created_at)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={r.is_active ? 'green' : 'gray'}>{r.is_active ? 'Active' : 'Inactive'}</Badge>
              <Button tone={r.is_active ? 'danger' : 'green'} size="sm" onClick={() => toggle(r)}>
                {r.is_active ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Pagination meta={data?.meta} onPage={setPage} />
      {creating && <CreateRider onClose={() => setCreating(false)} onCreated={refresh} />}
    </div>
  );
}
