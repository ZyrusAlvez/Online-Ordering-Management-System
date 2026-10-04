import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import PhoneInput from '../../components/PhoneInput.jsx';
import AddressFields, { blankAddress, cleanAddress, fromSaved } from '../../components/AddressFields.jsx';
import Avatar from '../../components/Avatar.jsx';
import { Button, Card, ErrorNote, Field, Input, PageLoader } from '../../components/ui.jsx';

function Section({ title, hint, children }) {
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        {hint && <p className="text-sm text-ink-soft">{hint}</p>}
      </div>
      {children}
    </Card>
  );
}

function DetailsForm({ profile, onSaved }) {
  const toast = useToast();
  const [name, setName] = useState(profile.full_name ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [hasAddress, setHasAddress] = useState(Boolean(profile.default_address));
  const [address, setAddress] = useState(fromSaved(profile.default_address));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.patch(
        '/auth/profile',
        {
          full_name: name.trim(),
          phone: phone.trim() || null,
          default_address: hasAddress ? cleanAddress(address) : null,
        },
        { auth: true },
      );
      toast.success('Profile saved');
      onSaved(res.data);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <Section title="Contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input required maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <PhoneInput value={phone} onChange={setPhone} hint="Riders call this number for deliveries. 11 digits, e.g. 09171234567" />
        </div>
      </Section>

      <Section title="Default delivery address" hint="Filled in for you at checkout.">
        {hasAddress ? (
          <>
            <AddressFields value={address} onChange={setAddress} required />
            <Button
              type="button"
              tone="ghost"
              size="sm"
              onClick={() => {
                setHasAddress(false);
                setAddress(blankAddress);
              }}
            >
              Remove saved address
            </Button>
          </>
        ) : (
          <Button type="button" tone="outline" onClick={() => setHasAddress(true)}>
            Add an address
          </Button>
        )}
      </Section>

      <ErrorNote error={error} />
      <Button type="submit" size="lg" loading={busy}>
        Save changes
      </Button>
    </form>
  );
}

function PasswordForm() {
  const toast = useToast();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const mismatch = form.confirm && form.next !== form.confirm;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(
        '/auth/password',
        { current_password: form.current, new_password: form.next },
        { auth: true },
      );
      toast.success('Password changed');
      setForm({ current: '', next: '', confirm: '' });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <Section title="Password">
        <Field label="Current password">
          <Input type="password" required autoComplete="current-password" value={form.current} onChange={set('current')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New password" hint="At least 8 characters">
            <Input type="password" required minLength={8} autoComplete="new-password" value={form.next} onChange={set('next')} />
          </Field>
          <Field label="Confirm new password" error={mismatch ? 'Passwords do not match' : undefined}>
            <Input type="password" required autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
          </Field>
        </div>
        <ErrorNote error={error} />
        <Button type="submit" tone="dark" loading={busy} disabled={!form.current || form.next.length < 8 || form.next !== form.confirm}>
          Change password
        </Button>
      </Section>
    </form>
  );
}

export default function Profile() {
  const { data, error, loading, reload } = useFetch(() => api.get('/auth/profile', { auth: true }), []);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (data?.data) setProfile(data.data);
  }, [data]);

  if (loading && !profile) return <PageLoader />;
  if (error && !profile) {
    return (
      <div className="mx-auto mt-6 max-w-xl">
        <ErrorNote error={error} onRetry={reload} />
      </div>
    );
  }
  if (!profile) return null;

  return (
    <div className="mx-auto mt-2 max-w-2xl space-y-5">
      <div className="flex items-center gap-4">
        <Avatar src={profile.avatar_url} name={profile.full_name} email={profile.email} size={64} />
        <div className="min-w-0">
          <h1 className="font-display text-3xl sm:text-4xl">{profile.full_name || 'Your profile'}</h1>
          <p className="truncate text-sm text-ink-soft">
            {profile.email} ·{' '}
            {profile.sign_in_method === 'google' ? 'Signed in with Google' : 'Email and password'}
          </p>
        </div>
      </div>

      {/* Keyed so the form resets to the saved values after each save. */}
      <DetailsForm key={JSON.stringify(profile)} profile={profile} onSaved={setProfile} />
      {profile.can_change_password && <PasswordForm />}
    </div>
  );
}
