import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { del, get, patch, post, put } from '../helpers/client.js';
import { tokenFor } from '../helpers/auth.js';
import { db } from '../helpers/db.js';

// 1x1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const png = { raw: true, headers: { 'Content-Type': 'image/png' } };

let admin;
let cashier;
let customer;
let productId;

before(async () => {
  [admin, cashier, customer] = await Promise.all([
    tokenFor('admin'),
    tokenFor('cashier'),
    tokenFor('customer'),
  ]);
  const res = await post('/products', { name: `Image test ${Date.now()}`, price: 1 }, { token: admin });
  assert.equal(res.status, 201);
  productId = res.body.data.id;

  const site = (await get('/site/images')).body.data;
  for (const [key, url] of Object.entries(site)) {
    if (!url) continue;
    const file = await fetch(url);
    const bytes = Buffer.from(await file.arrayBuffer());
    bytes.type = file.headers.get('content-type');
    originalBytes[key] = bytes;
  }
});

after(async () => {
  if (productId) await del(`/products/${productId}`, { token: admin });
  // Put the brand images back exactly as found: the tests above replace and reset them.
  for (const [key, bytes] of Object.entries(originalBytes)) {
    await put(`/admin/site-images/${key}`, bytes, { ...png, headers: { 'Content-Type': bytes.type }, token: admin });
  }
  if (!originalBytes.logo) await del('/admin/site-images/logo', { token: admin });
});

const originalBytes = {};

const fetchStatus = async (url) => (await fetch(url)).status;

// Deleted objects can linger on the public CDN, so ask storage itself.
const existsInStorage = async (url) => {
  const path = url.split('/object/public/menu-images/')[1];
  const { error } = await db.storage.from('menu-images').download(path);
  return !error;
};

describe('PUT /products/:id/image', () => {
  it('stores the image in Supabase Storage and points the product at it', async () => {
    const res = await put(`/products/${productId}/image`, PNG, { ...png, token: admin });

    assert.equal(res.status, 200);
    const url = res.body.data.image_url;
    assert.match(url, /\/storage\/v1\/object\/public\/menu-images\/products\//);
    assert.equal(await fetchStatus(url), 200);
  });

  it('replaces the image and deletes the previous file', async () => {
    const before = (await get(`/products/${productId}`)).body.data.image_url;
    const res = await put(`/products/${productId}/image`, PNG, { ...png, token: admin });

    assert.equal(res.status, 200);
    assert.notEqual(res.body.data.image_url, before);
    assert.equal(await fetchStatus(res.body.data.image_url), 200);
    assert.equal(await existsInStorage(before), false);
  });

  it('403s a cashier: the shared menu is edited by the super admin only', async () => {
    const res = await put(`/products/${productId}/image`, PNG, { ...png, token: cashier });
    assert.equal(res.status, 403);
  });

  it('rejects bytes that are not an image even when labelled as one', async () => {
    const res = await put(`/products/${productId}/image`, Buffer.from('<svg onload=alert(1)>'), {
      ...png,
      token: admin,
    });
    assert.equal(res.status, 400);
  });

  it('rejects a request that is not sent as an image', async () => {
    const res = await put(`/products/${productId}/image`, {}, { token: admin });
    assert.equal(res.status, 400);
  });

  it('401s anonymous and 403s a customer', async () => {
    assert.equal((await put(`/products/${productId}/image`, PNG, png)).status, 401);
    assert.equal((await put(`/products/${productId}/image`, PNG, { ...png, token: customer })).status, 403);
  });

  it('404s an unknown product', async () => {
    const res = await put('/products/00000000-0000-0000-0000-000000000000/image', PNG, { ...png, token: admin });
    assert.equal(res.status, 404);
  });
});

describe('DELETE /products/:id/image', () => {
  it('clears the image and removes the stored file', async () => {
    const url = (await get(`/products/${productId}`)).body.data.image_url;
    assert.ok(url);

    const res = await del(`/products/${productId}/image`, { token: admin });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.image_url, null);
    assert.equal(await existsInStorage(url), false);
  });
});

describe('PATCH /products/:id image_url', () => {
  it('accepts an external URL and can blank it again', async () => {
    const set = await patch(`/products/${productId}`, { image_url: 'https://example.com/a.jpg' }, { token: admin });
    assert.equal(set.body.data.image_url, 'https://example.com/a.jpg');

    const cleared = await patch(`/products/${productId}`, { image_url: null }, { token: admin });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.data.image_url, null);
  });
});

describe('site images', () => {
  it('is readable without logging in', async () => {
    const res = await get('/site/images');

    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body.data), ['logo'], 'the promo photo is gone');
  });

  it('lets the super admin replace and reset the logo', async () => {
    const set = await put('/admin/site-images/logo', PNG, { ...png, token: admin });
    assert.equal(set.status, 200);
    assert.match(set.body.data.logo, /menu-images\/site\/logo\//);
    assert.equal(await fetchStatus(set.body.data.logo), 200);
    assert.equal((await get('/site/images')).body.data.logo, set.body.data.logo);

    const reset = await del('/admin/site-images/logo', { token: admin });
    assert.equal(reset.body.data.logo, null);
    assert.equal(await existsInStorage(set.body.data.logo), false);
  });

  it('rejects an unknown key and non-admins', async () => {
    assert.equal((await put('/admin/site-images/banner', PNG, { ...png, token: admin })).status, 400);
    assert.equal((await put('/admin/site-images/promo', PNG, { ...png, token: admin })).status, 400, 'promo was removed');
    assert.equal((await put('/admin/site-images/logo', PNG, { ...png, token: cashier })).status, 403);
    assert.equal((await put('/admin/site-images/logo', PNG, png)).status, 401);
  });
});
