import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { del, get, post, put } from '../helpers/client.js';
import { tokenFor } from '../helpers/auth.js';
import { db } from '../helpers/db.js';
import { branchId, cleanup, flatPricedProduct, orderTime, placeOnlineOrder } from '../helpers/fixtures.js';

let superAdmin;
let imusAdmin;
let customer;
let gma;
let imus;
let product;

const findIn = (menu, id) => menu.flatMap((c) => c.products).find((p) => p.id === id);

before(async () => {
  [superAdmin, imusAdmin, customer] = await Promise.all(['admin', 'branchAdmin', 'customer'].map(tokenFor));
  gma = await branchId('gma');
  imus = await branchId('imus');
  product = await flatPricedProduct();
});

after(async () => {
  await db.from('branch_unavailable_products').delete().eq('product_id', product.id);
  await cleanup();
});

describe('sold out at one branch', () => {
  it("hides the dish at that branch's menu only", async () => {
    const res = await put(`/admin/branches/${imus}/sold-out/${product.id}`, undefined, { token: imusAdmin });
    assert.equal(res.status, 204);

    const atImus = await get(`/menu?branch_id=${imus}`);
    assert.equal(findIn(atImus.body.data, product.id), undefined);

    const forStaff = await get(`/menu?branch_id=${imus}&include_unavailable=true`);
    const shown = findIn(forStaff.body.data, product.id);
    assert.equal(shown.is_available, false);
    assert.equal(shown.sold_out_here, true);

    const atGma = await get(`/menu?branch_id=${gma}`);
    assert.ok(findIn(atGma.body.data, product.id), 'still on the menu elsewhere');
  });

  it('refuses an order for it at that branch, but not at another', async () => {
    const body = {
      branch_id: imus,
      ...(await orderTime(imus)),
      fulfillment_type: 'pickup',
      payment_method: 'cash',
      items: [{ product_id: product.id, quantity: 1 }],
    };
    const refused = await post('/orders', body, { token: customer });
    assert.equal(refused.status, 409);
    assert.match(refused.body.error.message, /Sold out at this branch/);

    const elsewhere = await placeOnlineOrder('customer', { branch_id: gma });
    assert.equal(elsewhere.branch_id, gma);
  });

  it('is back once marked available again', async () => {
    assert.equal((await del(`/admin/branches/${imus}/sold-out/${product.id}`, { token: imusAdmin })).status, 204);
    const atImus = await get(`/menu?branch_id=${imus}`);
    assert.ok(findIn(atImus.body.data, product.id));
  });

  it("is only for that branch's admins (or the super admin)", async () => {
    assert.equal((await put(`/admin/branches/${gma}/sold-out/${product.id}`, undefined, { token: imusAdmin })).status, 403);
    assert.equal((await put(`/admin/branches/${gma}/sold-out/${product.id}`, undefined, { token: superAdmin })).status, 204);
    assert.equal((await del(`/admin/branches/${gma}/sold-out/${product.id}`, { token: superAdmin })).status, 204);
  });
});
