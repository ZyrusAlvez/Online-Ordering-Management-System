import { useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { CartProvider } from '../../context/CartContext.jsx';
import { api } from '../../lib/api.js';
import { useBranches } from '../../lib/branches.js';
import { clearKioskKey, getKioskKey, setKioskKey } from '../../lib/kiosk.js';
import { Logo } from '../../components/Logo.jsx';
import { Button, Card, ErrorNote, Field, Input, Select } from '../../components/ui.jsx';
import { Lock } from '../../components/icons.jsx';
import KioskFlow from './KioskFlow.jsx';
import KioskPaymentResult from './KioskPaymentResult.jsx';

function KioskGate({ onUnlocked }) {
  const { branches } = useBranches();
  const [branchId, setBranchId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // The device key is bound to this branch: every order it takes goes there.
      const { data } = await api.post('/employee/kiosk/unlock', {
        branch_id: branchId,
        password,
        device_name: `Kiosk ${new Date().toLocaleDateString('en-PH')}`,
      });
      setKioskKey(data.key);
      onUnlocked();
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
            <h1 className="font-display text-3xl leading-none">Kiosk locked</h1>
            <p className="text-xs text-ink-soft">Employee password required</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Branch">
            <Select required value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="" disabled>
                Choose this kiosk's branch
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
            Unlock kiosk
          </Button>
        </form>
      </Card>
    </div>
  );
}

export default function KioskApp() {
  const [unlocked, setUnlocked] = useState(() => Boolean(getKioskKey()));

  const lock = () => {
    clearKioskKey();
    setUnlocked(false);
  };

  if (!unlocked) return <KioskGate onUnlocked={() => setUnlocked(true)} />;

  return (
    // No persistence: a public terminal must start every customer with an empty cart.
    <CartProvider storageKey="3k.kioskCart" persist={false}>
      <Routes>
        <Route path="payment-result" element={<KioskPaymentResult onLocked={lock} />} />
        <Route path="*" element={<KioskFlow onLock={lock} />} />
      </Routes>
    </CartProvider>
  );
}
