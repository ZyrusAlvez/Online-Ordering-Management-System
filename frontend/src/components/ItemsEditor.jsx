import { useState } from 'react';
import { CartProvider, useCart } from '../context/CartContext.jsx';
import { money } from '../lib/format.js';
import MenuBrowser from './MenuBrowser.jsx';
import { Button, ErrorNote } from './ui.jsx';
import { Minus, Plus, Trash } from './icons.jsx';

/** Converts an order's order_items back into editable cart lines. */
export const linesFromOrder = (order) =>
  (order?.order_items ?? []).map((i) => ({
    key: `${i.product?.id}|${i.variant?.id ?? ''}|${i.notes ?? ''}`,
    product_id: i.product?.id,
    variant_id: i.variant?.id ?? null,
    name: i.product?.name ?? 'Item',
    variantLabel: i.variant?.label ?? null,
    unitPrice: Number(i.unit_price),
    quantity: i.quantity,
    notes: i.notes ?? null,
  }));

function Inner({ onSubmit, submitLabel, extra, canSubmit, branchId }) {
  const cart = useCart();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(cart.toOrderItems());
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_340px]">
      <div className="scroll-thin max-h-[58vh] overflow-y-auto rounded-2xl bg-cream px-4 pb-4">
        <MenuBrowser onAdd={cart.add} branchId={branchId} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="scroll-thin max-h-[30vh] flex-1 overflow-y-auto rounded-2xl border border-ink/10 bg-white p-3">
          {cart.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-soft">No items yet</p>
          ) : (
            <ul className="divide-y divide-ink/5">
              {cart.items.map((i) => (
                <li key={i.key} className="py-2">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="font-semibold">
                      {i.name}
                      {i.variantLabel ? ` (${i.variantLabel})` : ''}
                      {i.notes && <span className="block text-xs font-normal text-ink-soft">“{i.notes}”</span>}
                    </span>
                    <span className="font-semibold">{money(i.unitPrice * i.quantity)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      aria-label="Decrease"
                      className="rounded-full bg-cream-deep p-1.5"
                      onClick={() => cart.setQuantity(i.key, i.quantity - 1)}
                    >
                      {i.quantity === 1 ? <Trash size={14} /> : <Minus size={14} />}
                    </button>
                    <span className="w-5 text-center text-sm font-bold">{i.quantity}</span>
                    <button
                      aria-label="Increase"
                      className="rounded-full bg-cream-deep p-1.5"
                      onClick={() => cart.setQuantity(i.key, i.quantity + 1)}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-between text-lg font-bold">
          <span>Total</span>
          <span className="text-brand">{money(cart.estimate)}</span>
        </div>
        {extra}
        <ErrorNote error={error} />
        <Button
          size="lg"
          onClick={submit}
          loading={busy}
          disabled={cart.items.length === 0 || canSubmit === false}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

/**
 * Menu + cart in one panel, for staff building or correcting an order.
 * `onSubmit(items)` should throw on failure so the error shows inline.
 */
export default function ItemsEditor({ initialItems = [], ...rest }) {
  return (
    <CartProvider storageKey="3k.editor" persist={false} initialItems={initialItems}>
      <Inner {...rest} />
    </CartProvider>
  );
}
