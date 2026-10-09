import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { money } from '../../lib/format.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useStaffBranch } from '../../components/StaffBranch.jsx';
import {
  Badge,
  Button,
  Empty,
  ErrorNote,
  Field,
  Input,
  Modal,
  PageLoader,
  Select,
  Textarea,
} from '../../components/ui.jsx';
import { ChefHat, Plus, Trash } from '../../components/icons.jsx';
import ImageField from '../../components/ImageField.jsx';

function CategoryModal({ category, onClose, onSaved }) {
  const toast = useToast();
  const [name, setName] = useState(category?.name ?? '');
  const [sort, setSort] = useState(String(category?.sort_order ?? 0));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { name: name.trim(), sort_order: Number(sort) || 0 };
    try {
      if (category) await api.patch(`/categories/${category.id}`, body, { auth: true });
      else await api.post('/categories', body, { auth: true });
      toast.success('Category saved');
      onSaved();
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={category ? 'Edit category' : 'New category'}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name"><Input required autoFocus maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Sort order" hint="Lower numbers appear first">
          <Input type="number" step="1" min="-9999" max="9999" value={sort} onChange={(e) => setSort(e.target.value)} />
        </Field>
        <ErrorNote error={error} />
        <Button type="submit" size="lg" className="w-full" loading={busy}>Save</Button>
      </form>
    </Modal>
  );
}

function ProductModal({ product, categories, defaultCategory, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: product?.name ?? '',
    category_id: product?.category_id ?? defaultCategory ?? '',
    description: product?.description ?? '',
    price: product?.price ?? '',
    is_available: product?.is_available ?? true,
    customizations: (product?.customizations ?? []).join(', '),
    sort_order: product?.sort_order ?? 0,
  });
  const [variants, setVariants] = useState(
    (product?.variants ?? []).map((v) => ({ label: v.label, price: v.price ?? '' })),
  );
  const [image, setImage] = useState(null); // { blob } | { remove: true } | null
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setVariant = (i, k, v) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const body = {
      name: form.name.trim(),
      category_id: form.category_id || null,
      description: form.description.trim(),
      price: form.price === '' ? null : Number(form.price),
      is_available: form.is_available,
      customizations: form.customizations.split(',').map((s) => s.trim()).filter(Boolean),
      sort_order: Number(form.sort_order) || 0,
      variants: variants
        .filter((v) => v.label.trim())
        .map((v, i) => ({ label: v.label.trim(), price: v.price === '' ? null : Number(v.price), sort_order: i })),
    };

    try {
      const saved = product
        ? await api.patch(`/products/${product.id}`, body, { auth: true })
        : await api.post('/products', body, { auth: true });

      // The image goes up after the product exists, since a new product has no id until now.
      try {
        if (image?.blob) await api.put(`/products/${saved.data.id}/image`, image.blob, { auth: true });
        else if (image?.remove) await api.del(`/products/${saved.data.id}/image`, { auth: true });
      } catch (imageErr) {
        onSaved();
        toast.error(`Product saved, but the image failed: ${imageErr.friendly}`);
        onClose();
        return;
      }
      toast.success('Product saved');
      onSaved();
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={product ? 'Edit product' : 'New product'} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><Input required maxLength={200} value={form.name} onChange={set('name')} /></Field>
          <Field label="Category">
            <Select value={form.category_id} onChange={set('category_id')}>
              <option value="">— none —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Price (₱)" hint="Leave empty if priced by size options below">
            <Input type="number" min="0" max="999999.99" step="0.01" value={form.price} onChange={set('price')} />
          </Field>
          <Field label="Sort order"><Input type="number" step="1" min="-9999" max="9999" value={form.sort_order} onChange={set('sort_order')} /></Field>
        </div>

        <Field label="Description"><Textarea rows={2} maxLength={2000} value={form.description} onChange={set('description')} /></Field>
        <Field label="Photo">
          <ImageField current={product?.image_url} onChange={setImage} fallbackLabel="No photo" />
        </Field>
        <Field label="Choices" hint="Comma separated, e.g. Fried, Boiled. Customers pick one.">
          <Input maxLength={2000} value={form.customizations} onChange={set('customizations')} />
        </Field>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">Size / price options</span>
            <Button type="button" tone="outline" size="sm" onClick={() => setVariants((v) => [...v, { label: '', price: '' }])}>
              <Plus size={14} /> Add option
            </Button>
          </div>
          {variants.length === 0 && <p className="text-xs text-ink-soft">No options — the product uses its single price.</p>}
          <div className="space-y-2">
            {variants.map((v, i) => (
              <div key={i} className="flex gap-2">
                <Input placeholder="Label (e.g. 500g)" maxLength={100} value={v.label} onChange={(e) => setVariant(i, 'label', e.target.value)} />
                <Input type="number" min="0" max="999999.99" step="0.01" placeholder="Price" value={v.price} onChange={(e) => setVariant(i, 'price', e.target.value)} className="!w-32" />
                <button type="button" aria-label="Remove option" className="rounded-2xl p-2 text-brand hover:bg-brand/10" onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))}>
                  <Trash size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-3 text-sm font-semibold">
          <input type="checkbox" className="h-5 w-5 accent-[#e8202a]" checked={form.is_available} onChange={(e) => setForm((f) => ({ ...f, is_available: e.target.checked }))} />
          Available to order
        </label>

        <ErrorNote error={error} />
        <Button type="submit" size="lg" className="w-full" loading={busy}>Save product</Button>
      </form>
    </Modal>
  );
}

const priceText = (p) => {
  const priced = (p.variants ?? []).filter((v) => v.price != null);
  if (priced.length) {
    const prices = priced.map((v) => Number(v.price));
    return prices.length > 1 ? `${money(Math.min(...prices))} – ${money(Math.max(...prices))}` : money(prices[0]);
  }
  return p.price != null ? money(p.price) : 'No price';
};

export default function AdminMenu() {
  const toast = useToast();
  // The menu is shared: only the super admin edits it. Every admin can mark a
  // dish sold out at the branch chosen in the switcher.
  const { isSuper, branch, branchId } = useStaffBranch();
  const { data, error, loading, reload, refresh } = useFetch(
    () => api.get('/menu', { query: { include_unavailable: 'true', ...(branchId ? { branch_id: branchId } : {}) } }),
    [branchId],
  );
  const [catModal, setCatModal] = useState(null); // {} for new, category for edit
  const [prodModal, setProdModal] = useState(null); // {product?, categoryId?}

  const categories = data?.data ?? [];

  const everywhere = (p) => p.available_everywhere ?? p.is_available;

  const toggle = async (p) => {
    try {
      await api.patch(`/products/${p.id}`, { is_available: !everywhere(p) }, { auth: true });
      refresh();
    } catch (err) {
      toast.error(err.friendly);
    }
  };

  const toggleHere = async (p) => {
    const path = `/admin/branches/${branchId}/sold-out/${p.id}`;
    try {
      if (p.sold_out_here) await api.del(path, { auth: true });
      else await api.put(path, undefined, { auth: true });
      toast.success(`${p.name} ${p.sold_out_here ? 'is back on' : 'is sold out'} at ${branch.name}`);
      refresh();
    } catch (err) {
      toast.error(err.friendly);
    }
  };

  const removeProduct = async (p) => {
    if (!window.confirm(`Delete "${p.name}"? This can't be undone.`)) return;
    try {
      await api.del(`/products/${p.id}`, { auth: true });
      toast.success('Product deleted');
      refresh();
    } catch (err) {
      toast.error(err.friendly);
    }
  };

  const removeCategory = async (c) => {
    if (!window.confirm(`Delete the "${c.name}" category?`)) return;
    try {
      await api.del(`/categories/${c.id}`, { auth: true });
      toast.success('Category deleted');
      refresh();
    } catch (err) {
      toast.error(err.friendly);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-4xl">Menu</h1>
        {isSuper && (
          <div className="flex gap-2">
            <Button tone="outline" onClick={() => setCatModal({})}><Plus size={16} /> Category</Button>
            <Button onClick={() => setProdModal({})}><Plus size={16} /> Product</Button>
          </div>
        )}
      </div>
      <p className="max-w-2xl text-sm text-ink-soft">
        {branch
          ? `Every branch shares one menu and price list. Mark a dish sold out to hide it at ${branch.name} only.`
          : isSuper
            ? 'Every branch shares this menu and its prices. Choose a branch at the top to mark dishes sold out there.'
            : 'Choose one of your branches at the top to mark dishes sold out there.'}
      </p>

      <ErrorNote error={error} onRetry={reload} />
      {loading && !data && <PageLoader />}
      {!loading && !error && categories.length === 0 && <Empty title="No categories yet" hint="Create a category, then add products to it." />}

      {categories.map((c) => (
        <section key={c.id} className="rounded-3xl border border-ink/10 bg-paper">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 px-4 py-3">
            <h2 className="font-display text-2xl">{c.name}</h2>
            {isSuper && (
              <div className="flex gap-2">
                <Button tone="outline" size="sm" onClick={() => setProdModal({ categoryId: c.id })}>Add product</Button>
                <Button tone="ghost" size="sm" onClick={() => setCatModal(c)}>Rename</Button>
                <Button tone="danger" size="sm" onClick={() => removeCategory(c)}>Delete</Button>
              </div>
            )}
          </div>
          {c.products.length === 0 && <p className="px-4 py-5 text-sm text-ink-soft">No products in this category.</p>}
          <ul className="divide-y divide-ink/5">
            {c.products.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3">
                  {p.image_url ? (
                    <img src={p.image_url} alt="" className="h-12 w-12 rounded-xl object-cover" />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-cream-deep text-sun-dark"><ChefHat size={22} /></span>
                  )}
                  <div>
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-xs text-ink-soft">
                      {priceText(p)}
                      {p.variants?.length ? ` · ${p.variants.length} options` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {branch && everywhere(p) && (
                    p.sold_out_here ? (
                      <>
                        <Badge tone="red">Sold out at {branch.name}</Badge>
                        <Button size="sm" tone="green" onClick={() => toggleHere(p)}>Back on</Button>
                      </>
                    ) : (
                      <Button size="sm" tone="outline" onClick={() => toggleHere(p)}>Mark sold out</Button>
                    )
                  )}
                  {isSuper ? (
                    <>
                      <button onClick={() => toggle(p)} title="Switch on or off at every branch">
                        <Badge tone={everywhere(p) ? 'green' : 'gray'}>
                          {everywhere(p) ? 'On the menu' : 'Off everywhere'}
                        </Badge>
                      </button>
                      <Button tone="outline" size="sm" onClick={() => setProdModal({ product: { ...p, category_id: c.id } })}>Edit</Button>
                      <Button tone="danger" size="sm" onClick={() => removeProduct(p)}>Delete</Button>
                    </>
                  ) : (
                    !everywhere(p) && <Badge tone="gray">Off everywhere</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {catModal && (
        <CategoryModal category={catModal.id ? catModal : null} onClose={() => setCatModal(null)} onSaved={refresh} />
      )}
      {prodModal && (
        <ProductModal
          product={prodModal.product}
          defaultCategory={prodModal.categoryId}
          categories={categories}
          onClose={() => setProdModal(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
