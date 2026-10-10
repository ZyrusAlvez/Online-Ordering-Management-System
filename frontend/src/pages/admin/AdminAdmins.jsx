import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { dateTime } from '../../lib/format.js';
import { useToast } from '../../context/ToastContext.jsx';
import PhoneInput from '../../components/PhoneInput.jsx';
import { useStaffBranch } from '../../components/StaffBranch.jsx';
import { Badge, Button, Empty, ErrorNote, Field, Input, Modal, PageLoader, Pagination } from '../../components/ui.jsx';
import { Plus } from '../../components/icons.jsx';

/** Tick-boxes for the branches an admin manages. At least one is required. */
function BranchChecklist({ value, onChange }) {
  const { branches } = useStaffBranch();
  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-ink">Branches they manage</legend>
      <div className="grid grid-cols-2 gap-2">
        {branches.map((b) => (
          <label
            key={b.id}
            className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
              value.includes(b.id) ? 'border-ink bg-ink/5 font-semibold' : 'border-line'
            }`}
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#e8202a]"
              checked={value.includes(b.id)}
              onChange={() => toggle(b.id)}
            />
            {b.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function AdminForm({ admin, onClose, onSaved }) {
  const toast = useToast();
  const editing = Boolean(admin);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', phone: '' });
  const [branchIds, setBranchIds] = useState(admin?.branches.map((b) => b.id) ?? []);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await api.patch(`/admin/admins/${admin.id}`, { branch_ids: branchIds }, { auth: true });
      } else {
        await api.post(
          '/admin/admins',
          {
            full_name: form.full_name.trim(),
            email: form.email.trim(),
            password: form.password,
            branch_ids: branchIds,
            ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
          },
          { auth: true },
        );
      }
      toast.success(editing ? 'Branches updated' : 'Admin account created');
      onSaved();
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={editing ? `${admin.full_name || 'Admin'}: branches` : 'New admin'}>
      <form onSubmit={submit} className="space-y-4">
        {!editing && (
          <>
            <Field label="Full name"><Input required maxLength={120} autoComplete="off" value={form.full_name} onChange={set('full_name')} /></Field>
            <Field label="Email"><Input type="email" required maxLength={254} autoComplete="off" value={form.email} onChange={set('email')} /></Field>
            <Field label="Temporary password" hint="At least 8 characters. Share it with the admin.">
              <Input type="text" required minLength={8} maxLength={72} autoComplete="off" value={form.password} onChange={set('password')} />
            </Field>
            <PhoneInput label="Phone" value={form.phone} onChange={(phone) => setForm((f) => ({ ...f, phone }))} />
          </>
        )}
        <BranchChecklist value={branchIds} onChange={setBranchIds} />
        <p className="text-xs text-ink-soft">
          They see and manage only these branches: orders, sales, riders, kiosks and employee passwords.
        </p>
        <ErrorNote error={error} />
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={branchIds.length === 0}>
          {editing ? 'Save branches' : 'Create admin'}
        </Button>
      </form>
    </Modal>
  );
}

export default function AdminAdmins() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // null | 'new' | admin
  const { data, error, loading, reload, refresh } = useFetch(
    () => api.get('/admin/admins', { auth: true, query: { page, limit: 20 } }),
    [page],
  );

  const toggle = async (admin) => {
    try {
      await api.patch(`/admin/admins/${admin.id}`, { is_active: !admin.is_active }, { auth: true });
      toast.success(admin.is_active ? 'Admin deactivated' : 'Admin activated');
      refresh();
    } catch (err) {
      toast.error(err.friendly);
    }
  };

  const admins = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">Admins</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            A branch admin runs one or more branches and cannot see any other. Super admins manage every branch, the
            menu, the branches themselves and these accounts.
          </p>
        </div>
        <Button onClick={() => setEditing('new')}><Plus size={16} /> New admin</Button>
      </div>
      <ErrorNote error={error} onRetry={reload} />
      {loading && !data && <PageLoader />}
      {!loading && !error && admins.length === 0 && <Empty title="No admins yet" />}
      <div className="space-y-2">
        {admins.map((a) => {
          const isSuper = a.role === 'super_admin';
          return (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-paper p-4">
              <div className="min-w-0">
                <p className="font-bold">
                  {a.full_name || 'Unnamed admin'}{' '}
                  {isSuper && <Badge tone="blue">Super admin</Badge>}
                </p>
                <p className="text-xs text-ink-soft">
                  {isSuper ? 'Every branch' : a.branches.map((b) => b.name).join(', ') || 'No branches'} · added{' '}
                  {dateTime(a.created_at)}
                </p>
              </div>
              {!isSuper && (
                <div className="flex items-center gap-2">
                  <Badge tone={a.is_active ? 'green' : 'gray'}>{a.is_active ? 'Active' : 'Inactive'}</Badge>
                  <Button tone="outline" size="sm" onClick={() => setEditing(a)}>Branches</Button>
                  <Button tone={a.is_active ? 'danger' : 'green'} size="sm" onClick={() => toggle(a)}>
                    {a.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Pagination meta={data?.meta} onPage={setPage} />
      {editing && (
        <AdminForm admin={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={refresh} />
      )}
    </div>
  );
}
