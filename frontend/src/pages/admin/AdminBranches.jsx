import { Suspense, lazy, useState } from 'react';
import { api } from '../../lib/api.js';
import { refreshBranches } from '../../lib/branches.js';
import { useFetch } from '../../lib/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import PhoneInput from '../../components/PhoneInput.jsx';
import { useStaffBranch } from '../../components/StaffBranch.jsx';
import { hoursLabel } from '../../lib/geo.js';
import { Badge, Button, Empty, ErrorNote, Field, Input, Modal, PageLoader, Spinner } from '../../components/ui.jsx';
import { Pin, Plus } from '../../components/icons.jsx';

// The same pin-drop map the checkout uses, loaded only when the form opens.
const AddressMap = lazy(() => import('../../components/AddressMap.jsx'));

const blank = {
  name: '',
  code: '',
  address: '',
  phone: '',
  latitude: null,
  longitude: null,
  allDay: false,
  opens_at: '08:00',
  closes_at: '21:00',
  is_active: true,
};

const fromBranch = (b) => ({
  ...blank,
  ...b,
  address: b.address ?? '',
  phone: b.phone ?? '',
  allDay: !b.opens_at,
  opens_at: b.opens_at ?? '08:00',
  closes_at: b.closes_at ?? '21:00',
});

/** "Dasma Bayan" -> "dasma-bayan": a starting point the admin can change. */
const slug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);

function BranchForm({ branch, onClose, onSaved }) {
  const toast = useToast();
  const editing = Boolean(branch);
  const [form, setForm] = useState(() => (branch ? fromBranch(branch) : blank));
  const [codeTouched, setCodeTouched] = useState(editing);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const pinned = typeof form.latitude === 'number';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      name: form.name.trim(),
      address: form.address.trim(),
      phone: form.phone.trim() || null,
      latitude: form.latitude,
      longitude: form.longitude,
      opens_at: form.allDay ? null : form.opens_at,
      closes_at: form.allDay ? null : form.closes_at,
      is_active: form.is_active,
      ...(editing ? {} : { code: form.code.trim() }),
    };
    try {
      if (editing) await api.patch(`/admin/branches/${branch.id}`, body, { auth: true });
      else await api.post('/admin/branches', body, { auth: true });
      toast.success(editing ? 'Branch saved' : `${body.name} added`);
      onSaved();
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={editing ? `Edit ${branch.name}` : 'New branch'} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Branch name">
            <Input
              required
              maxLength={80}
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => ({ ...f, name, ...(codeTouched ? {} : { code: slug(name) }) }));
              }}
              placeholder="e.g. Tanza"
            />
          </Field>
          <Field
            label="Code"
            hint={editing ? 'Fixed once created.' : "Short id, used in the branch's register login."}
          >
            <Input
              required
              disabled={editing}
              pattern="[a-z0-9\-]{2,30}"
              maxLength={30}
              value={form.code}
              onChange={(e) => {
                setCodeTouched(true);
                set('code')(e);
              }}
            />
          </Field>
          <Field label="Address" hint="Shown on the map and the branch list.">
            <Input maxLength={300} value={form.address} onChange={set('address')} />
          </Field>
          <PhoneInput label="Phone" value={form.phone} onChange={(phone) => setForm((f) => ({ ...f, phone }))} />
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-ink">Location on the map</span>
          <Suspense
            fallback={
              <div className="flex h-64 items-center justify-center rounded-xl border border-line text-brand">
                <Spinner />
              </div>
            }
          >
            <AddressMap
              value={pinned ? { latitude: form.latitude, longitude: form.longitude } : null}
              onChange={(point) =>
                setForm((f) => ({ ...f, latitude: point?.latitude ?? null, longitude: point?.longitude ?? null }))
              }
              onSuggest={(found) =>
                setForm((f) =>
                  f.address ? f : { ...f, address: [found.line1, found.barangay, found.city].filter(Boolean).join(', ') },
                )
              }
            />
          </Suspense>
          {!pinned && <p className="mt-1 text-xs text-brand-dark">Drop a pin where the branch is.</p>}
        </div>

        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-medium text-ink">Opening hours (Manila time)</legend>
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[#e8202a]"
              checked={form.allDay}
              onChange={(e) => setForm((f) => ({ ...f, allDay: e.target.checked }))}
            />
            Open 24 hours
          </label>
          {!form.allDay && (
            <div className="grid max-w-sm grid-cols-2 gap-3">
              <Field label="Opens">
                <Input type="time" required step={900} value={form.opens_at} onChange={set('opens_at')} />
              </Field>
              <Field label="Closes">
                <Input type="time" required step={900} value={form.closes_at} onChange={set('closes_at')} />
              </Field>
            </div>
          )}
        </fieldset>

        <label className="flex items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            className="h-5 w-5 accent-[#e8202a]"
            checked={form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
          />
          Open for orders (shown on the map)
        </label>

        <ErrorNote error={error} />
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!pinned}>
          {editing ? 'Save branch' : 'Add branch'}
        </Button>
      </form>
    </Modal>
  );
}

export default function AdminBranches() {
  const { reloadBranches } = useStaffBranch();
  const [editing, setEditing] = useState(null); // null | 'new' | branch
  const { data, error, loading, reload, refresh } = useFetch(() => api.get('/admin/branches', { auth: true }), []);
  const branches = data?.data ?? [];

  const saved = () => {
    refresh();
    reloadBranches();
    refreshBranches();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">Branches</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Every active branch appears on the landing-page map and can take orders. A branch that closes is
            deactivated, not deleted, so its past orders keep their history.
          </p>
        </div>
        <Button onClick={() => setEditing('new')}><Plus size={16} /> New branch</Button>
      </div>
      <ErrorNote error={error} onRetry={reload} />
      {loading && !data && <PageLoader />}
      {!loading && !error && branches.length === 0 && <Empty title="No branches yet" />}
      <div className="grid gap-3 md:grid-cols-2">
        {branches.map((b) => (
          <div key={b.id} className="flex items-start justify-between gap-3 rounded-2xl border border-ink/10 bg-paper p-4">
            <div className="min-w-0">
              <p className="font-bold">
                {b.name} <span className="text-xs font-normal text-ink-soft">({b.code})</span>
              </p>
              <p className="mt-0.5 flex items-start gap-1 text-xs text-ink-soft">
                <Pin size={14} className="mt-px shrink-0" /> {b.address || 'No address yet'}
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                {hoursLabel(b)}
                {b.phone ? ` · ${b.phone}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <Badge tone={b.is_active ? 'green' : 'gray'}>{b.is_active ? 'Active' : 'Closed'}</Badge>
              <Button tone="outline" size="sm" onClick={() => setEditing(b)}>Edit</Button>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <BranchForm branch={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={saved} />
      )}
    </div>
  );
}
