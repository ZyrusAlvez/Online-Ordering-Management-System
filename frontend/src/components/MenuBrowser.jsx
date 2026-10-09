import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useFetch } from '../lib/hooks.js';
import { money } from '../lib/format.js';
import { Button, ErrorNote, Modal, PageLoader } from './ui.jsx';
import { ChefHat, Minus, Plus, Search } from './icons.jsx';

/** Variants a customer can actually order (priced). */
const orderableVariants = (p) => (p.variants ?? []).filter((v) => v.price != null);

export const isOrderable = (p) => {
  if (!p.is_available) return false;
  if (p.variants?.length) return orderableVariants(p).length > 0;
  return p.price != null;
};

const priceLabel = (p) => {
  const variants = orderableVariants(p);
  if (variants.length) {
    const min = Math.min(...variants.map((v) => Number(v.price)));
    return variants.length > 1 ? `from ${money(min)}` : money(min);
  }
  return p.price != null ? money(p.price) : 'Not priced yet';
};

function ProductImage({ product, className = '' }) {
  if (product.image_url) {
    return (
      <img
        src={product.image_url}
        alt={product.name}
        loading="lazy"
        className={`object-cover ${className}`}
      />
    );
  }
  return (
    <div
      className={`flex items-center justify-center bg-cream-deep text-ink/25 ${className}`}
    >
      <ChefHat size={36} />
    </div>
  );
}

function ProductModal({ product, onClose, onAdd, big }) {
  const variants = orderableVariants(product);
  const [variantId, setVariantId] = useState(variants.length === 1 ? variants[0].id : null);
  const [choice, setChoice] = useState(null);
  const [note, setNote] = useState('');
  const [qty, setQty] = useState(1);

  const variant = variants.find((v) => v.id === variantId) ?? null;
  const unit = variant ? Number(variant.price) : Number(product.price ?? 0);
  const needsVariant = variants.length > 0 && !variant;
  const needsChoice = (product.customizations?.length ?? 0) > 0 && !choice;

  const submit = () => {
    const notes = [choice, note.trim()].filter(Boolean).join(' · ');
    onAdd({
      product_id: product.id,
      variant_id: variant?.id ?? null,
      name: product.name,
      variantLabel: variant?.label ?? null,
      unitPrice: unit,
      quantity: qty,
      notes: notes || null,
    });
    onClose();
  };

  const pill = (active) =>
    `rounded-xl border px-4 py-2 font-medium transition ${big ? 'text-lg' : 'text-sm'} ${
      active ? 'border-ink bg-ink text-white' : 'border-line bg-white hover:border-ink/30'
    }`;

  return (
    <Modal
      open
      onClose={onClose}
      title={product.name}
      footer={
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 rounded-2xl bg-cream-deep p-1">
            <button
              aria-label="Decrease quantity"
              className="rounded-xl p-2 hover:bg-white"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
            >
              <Minus />
            </button>
            <span className="w-8 text-center text-lg font-bold">{qty}</span>
            <button
              aria-label="Increase quantity"
              className="rounded-xl p-2 hover:bg-white"
              onClick={() => setQty((q) => Math.min(50, q + 1))}
            >
              <Plus />
            </button>
          </div>
          <Button
            size={big ? 'xl' : 'lg'}
            disabled={needsVariant || needsChoice}
            onClick={submit}
            className="flex-1"
          >
            Add · {money(unit * qty)}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {product.description && <p className="text-ink-soft">{product.description}</p>}

        {variants.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
              Choose size
            </legend>
            <div className="flex flex-wrap gap-2">
              {variants.map((v) => (
                <button key={v.id} className={pill(v.id === variantId)} onClick={() => setVariantId(v.id)}>
                  {v.label} · {money(v.price)}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {product.customizations?.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
              Choose one
            </legend>
            <div className="flex flex-wrap gap-2">
              {product.customizations.map((c) => (
                <button key={c} className={pill(c === choice)} onClick={() => setChoice(c)}>
                  {c}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <label className="block">
          <span className="mb-1 block text-sm font-bold uppercase tracking-wide text-ink-soft">
            Special instructions
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 200))}
            placeholder="e.g. no onions"
            className="w-full rounded-2xl border border-line bg-white px-4 py-2.5 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
        </label>
      </div>
    </Modal>
  );
}

/**
 * The menu used by every ordering surface (customer, kiosk, POS).
 * `onAdd(line)` receives a cart line; the host decides what to do with it.
 * `branchId` shows what that branch has sold out as sold out.
 */
export default function MenuBrowser({ onAdd, branchId = null, size = 'normal', stickyTop = 'top-0' }) {
  const big = size === 'kiosk';
  const { data, error, loading, reload } = useFetch(
    () => api.get('/menu', { query: { include_unavailable: 'true', ...(branchId ? { branch_id: branchId } : {}) } }),
    [branchId],
  );
  const [active, setActive] = useState('all');
  const [search, setSearch] = useState('');
  const [picking, setPicking] = useState(null);

  const categories = data?.data ?? [];

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories
      .filter((c) => active === 'all' || c.id === active)
      .map((c) => ({
        ...c,
        products: c.products.filter((p) => !q || p.name.toLowerCase().includes(q)),
      }))
      .filter((c) => c.products.length > 0);
  }, [categories, active, search]);

  if (loading) return <PageLoader label="Loading the menu…" />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const choose = (product) => {
    if (!isOrderable(product)) return;
    const variants = orderableVariants(product);
    const simple = variants.length === 0 && !(product.customizations?.length > 0);
    if (simple) {
      onAdd({
        product_id: product.id,
        variant_id: null,
        name: product.name,
        variantLabel: null,
        unitPrice: Number(product.price),
        quantity: 1,
        notes: null,
      });
    } else {
      setPicking(product);
    }
  };

  const tab = (isActive) =>
    `shrink-0 rounded-full border font-medium transition ${big ? 'px-6 py-3 text-lg' : 'px-4 py-1.5 text-sm'} ${
      isActive ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-ink/30'
    }`;

  return (
    <div>
      <div className={`sticky ${stickyTop} z-10 -mx-4 bg-cream/95 px-4 pb-3 pt-2 backdrop-blur`}>
        {!big && (
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the menu"
              maxLength={120}
              aria-label="Search the menu"
              className="w-full rounded-xl border border-line bg-white py-2.5 pl-12 pr-4 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          </div>
        )}
        <div className="scroll-thin flex gap-2 overflow-x-auto pb-1">
          <button className={tab(active === 'all')} onClick={() => setActive('all')}>
            All
          </button>
          {categories.map((c) => (
            <button key={c.id} className={tab(active === c.id)} onClick={() => setActive(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 && (
        <p className="py-16 text-center text-ink-soft">Nothing matches “{search}”.</p>
      )}

      {visible.map((c) => (
        <section key={c.id} className="mb-8">
          <h2 className={`mb-3 font-display text-ink ${big ? 'text-4xl' : 'text-xl'}`}>
            {c.name}
          </h2>
          <div
            className={`grid gap-3 ${
              big ? 'grid-cols-2 gap-5 xl:grid-cols-3' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4'
            }`}
          >
            {c.products.map((p) => {
              const ok = isOrderable(p);
              return (
                <button
                  key={p.id}
                  onClick={() => choose(p)}
                  disabled={!ok}
                  className={`group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-paper text-left transition ${
                    ok ? 'hover:border-ink/25 active:scale-[0.99]' : 'opacity-60'
                  }`}
                >
                  <ProductImage product={p} className={`w-full ${big ? 'h-44' : 'h-28 sm:h-32'}`} />
                  <div className={`flex flex-1 flex-col gap-1 ${big ? 'p-4' : 'p-3'}`}>
                    <span className={`font-semibold leading-snug ${big ? 'text-xl' : 'text-sm sm:text-base'}`}>
                      {p.name}
                    </span>
                    <span className={`mt-auto font-semibold text-brand ${big ? 'text-xl' : 'text-sm'}`}>
                      {ok ? priceLabel(p) : p.is_available ? 'Unavailable' : 'Sold out'}
                    </span>
                  </div>
                  {ok && (
                    <span className="absolute right-2 top-2 rounded-full bg-white p-1.5 text-brand ring-1 ring-line">
                      <Plus size={big ? 22 : 16} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {picking && (
        <ProductModal product={picking} big={big} onClose={() => setPicking(null)} onAdd={onAdd} />
      )}
    </div>
  );
}
