import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { get } from '../helpers/client.js';
import { db } from '../helpers/db.js';

describe('GET /menu', () => {
  it('is public — no token needed', async () => {
    const res = await get('/menu');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.length > 0);
  });

  it('nests products and variants under each category', async () => {
    const { body } = await get('/menu');
    const category = body.data.find((c) => c.products.length > 0);

    assert.ok(category.id && category.name);
    const product = category.products[0];
    assert.ok('price' in product);
    assert.ok(Array.isArray(product.variants));
    assert.ok(Array.isArray(product.customizations));
  });

  it('returns categories in sort_order', async () => {
    const { body } = await get('/menu');
    const orders = body.data.map((c) => c.sort_order);
    assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
  });

  it('returns variants in sort_order within a product', async () => {
    const { body } = await get('/menu');
    const withVariants = body.data
      .flatMap((c) => c.products)
      .filter((p) => p.variants.length > 1);

    assert.ok(withVariants.length > 0, 'expected at least one multi-variant product');
    for (const product of withVariants) {
      const orders = product.variants.map((v) => v.sort_order);
      assert.deepEqual(orders, [...orders].sort((a, b) => a - b), product.name);
    }
  });

  it('hides unavailable products by default', async () => {
    const { data: product } = await db
      .from('products')
      .select('id, name')
      .eq('is_available', true)
      .limit(1)
      .single();

    await db.from('products').update({ is_available: false }).eq('id', product.id);
    try {
      const { body } = await get('/menu');
      const ids = body.data.flatMap((c) => c.products).map((p) => p.id);
      assert.equal(ids.includes(product.id), false, 'sold-out item should be hidden');
    } finally {
      await db.from('products').update({ is_available: true }).eq('id', product.id);
    }
  });

  it('includes unavailable products when asked, for POS and admin screens', async () => {
    const { data: product } = await db
      .from('products')
      .select('id')
      .eq('is_available', true)
      .limit(1)
      .single();

    await db.from('products').update({ is_available: false }).eq('id', product.id);
    try {
      const { body } = await get('/menu?include_unavailable=true');
      const ids = body.data.flatMap((c) => c.products).map((p) => p.id);
      assert.ok(ids.includes(product.id));
    } finally {
      await db.from('products').update({ is_available: true }).eq('id', product.id);
    }
  });

  it('rejects a non-boolean include_unavailable', async () => {
    const res = await get('/menu?include_unavailable=maybe');
    assert.equal(res.status, 400);
  });
});

describe('GET /products', () => {
  it('paginates with meta', async () => {
    const res = await get('/products?limit=5');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 5);
    assert.equal(res.body.meta.limit, 5);
    assert.ok(res.body.meta.total > 5);
    assert.equal(res.body.meta.pages, Math.ceil(res.body.meta.total / 5));
  });

  it('returns different rows on a later page', async () => {
    const first = await get('/products?limit=3&page=1');
    const second = await get('/products?limit=3&page=2');
    const a = first.body.data.map((p) => p.id);
    const b = second.body.data.map((p) => p.id);
    assert.equal(a.some((id) => b.includes(id)), false);
  });

  it('filters by search term', async () => {
    const res = await get('/products?search=Bilao');
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length > 0);
    for (const product of res.body.data) {
      assert.match(product.name.toLowerCase(), /bilao/);
    }
  });

  it('returns an empty page rather than 404 when nothing matches', async () => {
    const res = await get('/products?search=zzzznotathing');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, []);
    assert.equal(res.body.meta.total, 0);
  });

  it('rejects a limit over the cap', async () => {
    assert.equal((await get('/products?limit=500')).status, 400);
  });

  it('rejects a non-uuid category filter', async () => {
    assert.equal((await get('/products?category_id=abc')).status, 400);
  });
});

describe('GET /products/:id', () => {
  it('returns one product with its variants and category', async () => {
    const list = await get('/products?limit=1');
    const id = list.body.data[0].id;

    const res = await get(`/products/${id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.id, id);
    assert.ok('variants' in res.body.data);
  });

  it('404s for a well-formed but unknown id', async () => {
    const res = await get('/products/00000000-0000-4000-8000-000000000000');
    assert.equal(res.status, 404);
  });

  it('400s for a malformed id', async () => {
    assert.equal((await get('/products/not-a-uuid')).status, 400);
  });
});

describe('GET /categories', () => {
  it('lists categories publicly, in sort order', async () => {
    const res = await get('/categories');
    assert.equal(res.status, 200);
    const orders = res.body.data.map((c) => c.sort_order);
    assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
  });
});

after(async () => {
  // Guard against a failed test leaving an item hidden from the live menu.
  await db.from('products').update({ is_available: true }).eq('is_available', false);
});
