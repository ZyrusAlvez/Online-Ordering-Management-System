import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const CartContext = createContext(null);

export const MAX_LINE_QUANTITY = 99;
/** Fired by sign-out so a shared device does not hand the next person the last person's cart. */
export const LOGOUT_EVENT = '3k:logout';

const clampQuantity = (n) => Math.min(MAX_LINE_QUANTITY, Math.max(1, Math.floor(Number(n) || 1)));

/** Reads the saved cart, dropping anything that is not a well-formed line (an old or hand-edited value). */
const read = (key) => {
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    if (!Array.isArray(stored)) return [];
    return stored
      .filter((i) => i && typeof i.product_id === 'string' && typeof i.key === 'string')
      .map((i) => ({ ...i, quantity: clampQuantity(i.quantity), unitPrice: Number(i.unitPrice) || 0 }));
  } catch {
    return [];
  }
};

/**
 * Client-side cart. `unitPrice` is only for showing a running estimate — the
 * server recomputes every total from live menu prices when the order is placed.
 *
 * `storageKey` keeps the online cart and the kiosk cart apart; pass
 * `persist={false}` for a public terminal so the next customer starts empty;
 * `initialItems` seeds a non-persisted cart (e.g. editing an existing order).
 */
export function CartProvider({ storageKey = '3k.cart', persist = true, initialItems = [], children }) {
  const [items, setItems] = useState(() => (persist ? read(storageKey) : initialItems));

  useEffect(() => {
    if (!persist) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      // ignore
    }
  }, [items, storageKey, persist]);

  useEffect(() => {
    if (!persist) return undefined;
    const clearOnLogout = () => {
      setItems([]);
      // Also clear storage right now: signing out navigates away at once, often
      // before React gets to write the emptied cart back itself.
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
    };
    window.addEventListener(LOGOUT_EVENT, clearOnLogout);
    return () => window.removeEventListener(LOGOUT_EVENT, clearOnLogout);
  }, [persist, storageKey]);

  const add = useCallback((line) => {
    setItems((prev) => {
      const key = `${line.product_id}|${line.variant_id ?? ''}|${line.notes ?? ''}`;
      const hit = prev.find((i) => i.key === key);
      if (hit) {
        return prev.map((i) => (i.key === key ? { ...i, quantity: clampQuantity(i.quantity + line.quantity) } : i));
      }
      return [...prev, { ...line, quantity: clampQuantity(line.quantity), key }];
    });
  }, []);

  const setQuantity = useCallback((key, quantity) => {
    setItems((prev) =>
      quantity <= 0
        ? prev.filter((i) => i.key !== key)
        : prev.map((i) => (i.key === key ? { ...i, quantity: clampQuantity(quantity) } : i)),
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(
    () => ({
      items,
      add,
      setQuantity,
      clear,
      count: items.reduce((n, i) => n + i.quantity, 0),
      estimate: items.reduce((n, i) => n + i.quantity * (i.unitPrice ?? 0), 0),
      /** The shape every ordering endpoint expects. */
      toOrderItems: () =>
        items.map((i) => ({
          product_id: i.product_id,
          ...(i.variant_id ? { variant_id: i.variant_id } : {}),
          quantity: i.quantity,
          ...(i.notes ? { notes: i.notes } : {}),
        })),
    }),
    [items, add, setQuantity, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
