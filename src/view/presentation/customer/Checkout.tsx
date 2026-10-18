'use client';

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@/utils/navigation';
import { call, respond } from '@/utils/apiError';
import { getMyProfile, updateMyProfile } from '@/controllers/profileController';
import { placeOnlineOrder } from '@/controllers/orderController';
import { useFetch } from '@/hooks/hooks';
import { useGcashAccount } from '@/hooks/useGcash';
import { useSelectedBranch } from '@/hooks/useBranches';
import OrderBranchPicker from '@/view/components/OrderBranchPicker';
import ScheduleField from '@/view/components/ScheduleField';
import { money, scheduleLabel } from '@/utils/format';
import { useCart } from '@/context/CartContext';
import { useToast } from '@/context/ToastContext';
import PhoneInput from '@/view/components/PhoneInput';
import AddressFields, { blankAddress, cleanAddress, fromSaved } from '@/view/components/AddressFields';
import { Button, Card, Empty, ErrorNote, Field, Segmented, Textarea } from '@/view/components/ui';
import { Minus, Plus, Trash } from '@/view/components/icons';

export default function Checkout() {
  const cart = useCart();
  const toast = useToast();
  const navigate = useNavigate();
  const { branch } = useSelectedBranch();
  const gcash = useGcashAccount();

  const [fulfillment, setFulfillment] = useState('pickup');
  const [payment, setPayment] = useState('cash');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState(blankAddress);
  const [notes, setNotes] = useState('');
  // null = as soon as possible; otherwise the ISO time of the chosen slot.
  const [scheduledFor, setScheduledFor] = useState(null);
  const [saveAddress, setSaveAddress] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Prefill from the saved profile, once, and never over something already typed.
  const profile = useFetch(() => respond(getMyProfile()), []).data?.data;
  const prefilled = useRef(false);
  useEffect(() => {
    if (!profile || prefilled.current) return;
    prefilled.current = true;
    setPhone((p) => p || profile.phone || '');
    setAddress((a) => (a.line1 || a.city ? a : fromSaved(profile.default_address)));
  }, [profile]);

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto mt-10 max-w-lg">
        <Empty
          title="Your cart is empty"
          hint="Add a few dishes from the menu to get started."
          action={
            <Button to="/menu" className="mt-3">Browse the menu</Button>
          }
        />
      </div>
    );
  }

  const delivery = fulfillment === 'delivery';
  const offerToSave = delivery && profile && !profile.default_address;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const clean = (v) => v.trim() || undefined;
      const body = {
        branch_id: branch?.id,
        fulfillment_type: fulfillment,
        payment_method: payment,
        customer_phone: clean(phone),
        notes: clean(notes),
        items: cart.toOrderItems(),
        ...(scheduledFor ? { scheduled_for: scheduledFor } : {}),
        ...(delivery ? { delivery_address: cleanAddress(address) } : {}),
      };

      const order = await call(placeOnlineOrder(body));
      cart.clear();

      // Best effort: the order is already placed, so a failure here must not block it.
      if (offerToSave && saveAddress) {
        call(
          updateMyProfile({ default_address: cleanAddress(address), ...(!profile.phone && clean(phone) ? { phone: clean(phone) } : {}) }),
        ).catch(() => {});
      }

      toast.success(
        payment === 'gcash'
          ? `Order ${order.order_number} placed. Pay with GCash below.`
          : `Order ${order.order_number} placed${scheduledFor ? ` for ${scheduleLabel(scheduledFor)}` : ''}!`,
      );
      // The order page shows the GCash QR and takes the reference number / receipt.
      navigate(`/orders/${order.id}`, { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-2 grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        <h1 className="font-display text-4xl">
          Checkout
        </h1>

        <Card className="space-y-4">
          <h2 className="text-lg font-bold">Which branch?</h2>
          <OrderBranchPicker />
        </Card>

        {branch && (
          <Card className="space-y-4">
            <h2 className="text-lg font-bold">When?</h2>
            <ScheduleField key={branch.id} branch={branch} value={scheduledFor} onChange={setScheduledFor} />
          </Card>
        )}

        <Card className="space-y-4">
          <h2 className="text-lg font-bold">How would you like it?</h2>
          <Segmented
            value={fulfillment}
            onChange={setFulfillment}
            options={[
              { value: 'pickup', label: 'Pickup' },
              { value: 'delivery', label: 'Delivery' },
            ]}
          />
          <PhoneInput
            value={phone}
            onChange={setPhone}
            required={delivery}
            hint={delivery ? 'The rider will call this number. 11 digits, e.g. 09171234567' : 'Optional. 11 digits, e.g. 09171234567'}
          />

          {delivery && (
            <>
              <AddressFields value={address} onChange={setAddress} required />
              {offerToSave && (
                <label className="flex items-center gap-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[#e8202a]"
                    checked={saveAddress}
                    onChange={(e) => setSaveAddress(e.target.checked)}
                  />
                  Save this as my default address
                </label>
              )}
            </>
          )}
        </Card>

        <Card className="space-y-4">
          <h2 className="text-lg font-bold">Payment</h2>
          <Segmented
            value={payment}
            onChange={setPayment}
            options={[
              { value: 'cash', label: delivery ? 'Cash on delivery' : 'Pay at pickup' },
              // Offered only while a GCash account is configured to pay into.
              ...(gcash ? [{ value: 'gcash', label: 'GCash' }] : []),
            ]}
          />
          {payment === 'gcash' && (
            <p className="text-sm text-ink-soft">
              After you place your order we'll show our GCash QR and number. Send the total, then
              give us the reference number or a screenshot of your receipt so we can confirm it.
            </p>
          )}
          <Field label="Notes for the kitchen">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </Field>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Card className="space-y-4">
          <h2 className="text-lg font-bold">Your order</h2>
          <ul className="divide-y divide-ink/5">
            {cart.items.map((i) => (
              <li key={i.key} className="py-3">
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {i.name}
                      {i.variantLabel ? ` (${i.variantLabel})` : ''}
                    </p>
                    {i.notes && <p className="text-xs text-ink-soft">“{i.notes}”</p>}
                  </div>
                  <span className="font-semibold">{money(i.unitPrice * i.quantity)}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Decrease"
                    className="rounded-full bg-cream-deep p-1.5"
                    onClick={() => cart.setQuantity(i.key, i.quantity - 1)}
                  >
                    {i.quantity === 1 ? <Trash size={16} /> : <Minus size={16} />}
                  </button>
                  <span className="w-6 text-center font-bold">{i.quantity}</span>
                  <button
                    type="button"
                    aria-label="Increase"
                    className="rounded-full bg-cream-deep p-1.5"
                    onClick={() => cart.setQuantity(i.key, i.quantity + 1)}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {branch && (
            <p className="border-t border-ink/10 pt-3 text-sm text-ink-soft">
              {branch.name} ·{' '}
              <span className={scheduledFor ? 'font-semibold text-amber-800' : ''}>
                {scheduledFor ? scheduleLabel(scheduledFor) : 'As soon as possible'}
              </span>
            </p>
          )}
          <div className="flex items-center justify-between border-t border-ink/10 pt-3 text-lg font-bold">
            <span>Estimated total</span>
            <span className="text-brand">{money(cart.estimate)}</span>
          </div>
          <p className="text-xs text-ink-soft">
            The final total is confirmed by the kitchen's current prices when you place the order.
          </p>
          <ErrorNote error={error} />
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            Place order
          </Button>
        </Card>
      </aside>
    </form>
  );
}
