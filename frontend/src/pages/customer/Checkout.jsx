import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { money } from '../../lib/format.js';
import { useCart } from '../../context/CartContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import PhoneInput from '../../components/PhoneInput.jsx';
import AddressFields, { blankAddress, cleanAddress, fromSaved } from '../../components/AddressFields.jsx';
import { Button, Card, Empty, ErrorNote, Field, Input, Segmented, Textarea } from '../../components/ui.jsx';
import { Minus, Plus, Trash } from '../../components/icons.jsx';

export default function Checkout() {
  const cart = useCart();
  const toast = useToast();
  const navigate = useNavigate();

  const [fulfillment, setFulfillment] = useState('pickup');
  const [payment, setPayment] = useState('cash');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState(blankAddress);
  const [notes, setNotes] = useState('');
  const [saveAddress, setSaveAddress] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Prefill from the saved profile, once, and never over something already typed.
  const profile = useFetch(() => api.get('/auth/profile', { auth: true }), []).data?.data;
  const prefilled = useRef(false);
  useEffect(() => {
    if (!profile || prefilled.current) return;
    prefilled.current = true;
    setPhone((p) => p || profile.phone || '');
    setAddress((a) => (a.line1 || a.city ? a : fromSaved(profile.default_address)));
  }, [profile]);

  // Pressing Back from GCash can restore this page frozen mid-submit (spinner on,
  // cart already emptied). Send them to the order they just placed instead.
  const placedOrderId = useRef(null);
  useEffect(() => {
    const onShow = (e) => {
      if (!e.persisted) return;
      setBusy(false);
      if (placedOrderId.current) navigate(`/orders/${placedOrderId.current}`, { replace: true });
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, [navigate]);

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
        fulfillment_type: fulfillment,
        payment_method: payment,
        customer_phone: clean(phone),
        notes: clean(notes),
        items: cart.toOrderItems(),
        ...(delivery ? { delivery_address: cleanAddress(address) } : {}),
      };

      const { data: order } = await api.post('/orders', body, { auth: true });
      placedOrderId.current = order.id;
      cart.clear();

      // Best effort: the order is already placed, so a failure here must not block it.
      if (offerToSave && saveAddress) {
        api
          .patch(
            '/auth/profile',
            { default_address: cleanAddress(address), ...(!profile.phone && clean(phone) ? { phone: clean(phone) } : {}) },
            { auth: true },
          )
          .catch(() => {});
      }

      if (payment === 'gcash') {
        try {
          const { data } = await api.post(`/orders/${order.id}/payment`, undefined, { auth: true });
          window.location.href = data.checkout_url;
          return;
        } catch (err) {
          // The order exists; let them retry payment from its page.
          toast.error(`Order placed, but GCash couldn't start: ${err.friendly}`);
        }
      } else {
        toast.success(`Order ${order.order_number} placed!`);
      }
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
              { value: 'gcash', label: 'GCash' },
            ]}
          />
          {payment === 'gcash' && (
            <p className="text-sm text-ink-soft">
              You'll be sent to GCash to pay right after placing your order.
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
          <div className="flex items-center justify-between border-t border-ink/10 pt-3 text-lg font-bold">
            <span>Estimated total</span>
            <span className="text-brand">{money(cart.estimate)}</span>
          </div>
          <p className="text-xs text-ink-soft">
            The final total is confirmed by the kitchen's current prices when you place the order.
          </p>
          <ErrorNote error={error} />
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            {payment === 'gcash' ? 'Place order & pay' : 'Place order'}
          </Button>
        </Card>
      </aside>
    </form>
  );
}
