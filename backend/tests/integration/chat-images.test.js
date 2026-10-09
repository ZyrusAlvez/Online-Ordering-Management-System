import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { get, post } from '../helpers/client.js';
import { tokenFor } from '../helpers/auth.js';
import { db, setOrderState } from '../helpers/db.js';
import { branchId, cleanup, placeOnlineOrder } from '../helpers/fixtures.js';

// 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const png = { raw: true, headers: { 'Content-Type': 'image/png' } };
const ADDRESS = { line1: '9 Mabini St', city: 'Davao City' };

const threadIds = [];
let cashier;
let customer;
let customer2;
let rider;

before(async () => {
  [cashier, customer, customer2, rider] = await Promise.all([
    tokenFor('cashier'),
    tokenFor('customer'),
    tokenFor('customer2'),
    tokenFor('rider'),
  ]);
});

const deliveryOrderIds = [];

after(async () => {
  // Deleting a conversation does not delete its files, so collect them first: the
  // guest threads made here, and the delivery threads that go with each test order.
  const { data: deliveryThreads } = deliveryOrderIds.length
    ? await db.from('chat_threads').select('id').in('order_id', deliveryOrderIds)
    : { data: [] };
  const all = [...threadIds, ...(deliveryThreads ?? []).map((t) => t.id)];
  if (all.length) {
    const { data } = await db.from('chat_messages').select('image_path').in('thread_id', all).not('image_path', 'is', null);
    if (data?.length) await db.storage.from('chat-images').remove(data.map((m) => m.image_path));
  }
  await cleanup(); // delivery threads (and their messages) cascade from their order
  if (threadIds.length) await db.from('chat_threads').delete().in('id', threadIds);
});

/**
 * A guest conversation made directly in the database. Opening one through the API
 * is limited to 5 an hour per IP and the chat tests already use that budget.
 */
const guestThread = async () => {
  const token = `chat_${randomBytes(12).toString('base64url')}`;
  const { data, error } = await db.from('chat_threads').insert({ kind: 'support', branch_id: await branchId() }).select('id').single();
  assert.equal(error, null);
  threadIds.push(data.id);
  await db.from('chat_thread_secrets').insert({ thread_id: data.id, token_hash: createHash('sha256').update(token).digest('hex') });
  await db.from('chat_messages').insert({ thread_id: data.id, sender_role: 'visitor', body: 'hello' });
  return { id: data.id, token };
};
const guestHeaders = (token) => ({ 'Content-Type': 'image/png', 'X-Chat-Token': token });

const imagePathOf = async (messageId) =>
  (await db.from('chat_messages').select('image_path').eq('id', messageId).single()).data.image_path;

const fetchImage = async (url) => {
  const res = await fetch(url);
  return { status: res.status, type: res.headers.get('content-type'), bytes: Buffer.from(await res.arrayBuffer()) };
};

describe('guest sends a photo to the cashier', () => {
  let thread;
  let sent;

  before(async () => {
    thread = await guestThread();
  });

  it('stores it and returns a link that shows the picture', async () => {
    const res = await post(`/chat/visitor/threads/${thread.id}/images`, PNG, {
      raw: true,
      headers: guestHeaders(thread.token),
    });

    assert.equal(res.status, 201);
    sent = res.body.data;
    assert.equal(sent.sender_role, 'visitor');
    assert.equal(sent.body, '');
    assert.match(sent.image_url, /^https:\/\/.+\/storage\/v1\/object\/sign\/chat-images\//);
    assert.equal('image_path' in sent, false, 'the internal storage path is never exposed');

    const image = await fetchImage(sent.image_url);
    assert.equal(image.status, 200);
    assert.equal(image.type, 'image/png');
    assert.deepEqual(image.bytes, PNG);
  });

  it('is private: the same file has no public address', async () => {
    const path = await imagePathOf(sent.id);
    const direct = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/public/chat-images/${path}`);
    assert.notEqual(direct.status, 200);
  });

  it('shows the photo when the guest reloads the conversation', async () => {
    const res = await get(`/chat/visitor/threads/${thread.id}/messages`, { headers: { 'X-Chat-Token': thread.token } });
    const last = res.body.data.at(-1);

    assert.equal(last.id, sent.id);
    assert.ok(last.image_url);
    assert.equal(res.body.data[0].image_url, null, 'text messages have no image');
  });

  it('reaches the cashier, marks the thread unread and previews it as a photo', async () => {
    const inbox = await get('/pos/chat/threads', { token: cashier });
    const row = inbox.body.data.find((t) => t.id === thread.id);
    assert.equal(row.last_message, '📷 Photo');
    assert.equal(row.unread, true);

    const history = await get(`/pos/chat/threads/${thread.id}/messages`, { token: cashier });
    assert.ok(history.body.data.at(-1).image_url);
  });

  it('lets the cashier send one back, which the guest sees', async () => {
    const res = await post(`/pos/chat/threads/${thread.id}/images`, PNG, { ...png, token: cashier });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.sender_role, 'cashier');

    const guest = await get(`/chat/visitor/threads/${thread.id}/messages`, { headers: { 'X-Chat-Token': thread.token } });
    const last = guest.body.data.at(-1);
    assert.equal(last.sender_role, 'cashier');
    assert.equal((await fetchImage(last.image_url)).status, 200);
  });

  it('refuses a wrong or missing token', async () => {
    const path = `/chat/visitor/threads/${thread.id}/images`;
    assert.equal((await post(path, PNG, { raw: true, headers: guestHeaders('chat_wrong') })).status, 401);
    assert.equal((await post(path, PNG, png)).status, 401);
  });

  it('refuses files that are not pictures, even when labelled as one', async () => {
    const path = `/chat/visitor/threads/${thread.id}/images`;
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    assert.equal((await post(path, html, { raw: true, headers: guestHeaders(thread.token) })).status, 400);

    const gif = Buffer.from('474946383961010001000000002c00000000010001000002024401003b', 'hex');
    assert.equal((await post(path, gif, { raw: true, headers: guestHeaders(thread.token) })).status, 400, 'GIF is not allowed');

    // not sent as an image at all
    assert.equal((await post(path, {}, { headers: { 'X-Chat-Token': thread.token } })).status, 400);
  });

  it('refuses a file over 5 MB', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await post(`/chat/visitor/threads/${thread.id}/images`, big, { raw: true, headers: guestHeaders(thread.token) });
    assert.equal(res.status, 413);
  });

  it('leaves nothing behind for a refused upload', async () => {
    const before = await db.from('chat_messages').select('id', { count: 'exact', head: true }).eq('thread_id', thread.id);
    await post(`/chat/visitor/threads/${thread.id}/images`, Buffer.from('nope'), { raw: true, headers: guestHeaders(thread.token) });
    const after = await db.from('chat_messages').select('id', { count: 'exact', head: true }).eq('thread_id', thread.id);
    assert.equal(after.count, before.count);
    const { data: files } = await db.storage.from('chat-images').list(thread.id);
    const { data: rows } = await db.from('chat_messages').select('image_path').eq('thread_id', thread.id).not('image_path', 'is', null);
    assert.equal(files.length, rows.length, 'every stored file has a message');
  });

  it('is for the cashier side only on the staff route', async () => {
    const path = `/pos/chat/threads/${thread.id}/images`;
    assert.equal((await post(path, PNG, png)).status, 401);
    assert.equal((await post(path, PNG, { ...png, token: customer })).status, 403);
    assert.equal((await post(path, PNG, { ...png, token: rider })).status, 403);
  });

  it('stops at 30 photos per conversation', async () => {
    const full = await guestThread();
    const rows = Array.from({ length: 30 }, (_, i) => ({
      thread_id: full.id,
      sender_role: 'visitor',
      body: '',
      image_path: `${full.id}/placeholder-${i}.png`,
    }));
    assert.equal((await db.from('chat_messages').insert(rows)).error, null);

    const res = await post(`/chat/visitor/threads/${full.id}/images`, PNG, { raw: true, headers: guestHeaders(full.token) });
    assert.equal(res.status, 409);
    assert.match(res.body.error.message, /30 photos/);
  });
});

describe('database rules for photo messages', () => {
  it('allows a photo with no text, but not an empty text message', async () => {
    const { id } = await guestThread();
    const photo = await db.from('chat_messages').insert({ thread_id: id, sender_role: 'visitor', body: '', image_path: `${id}/a.png` });
    assert.equal(photo.error, null);
    const empty = await db.from('chat_messages').insert({ thread_id: id, sender_role: 'visitor', body: '   ' });
    assert.equal(empty.error?.code, '23514');
  });

  it('refuses a storage path that tries to climb out of its folder', async () => {
    const { id } = await guestThread();
    const res = await db.from('chat_messages').insert({ thread_id: id, sender_role: 'visitor', body: '', image_path: '../other/secret.png' });
    assert.equal(res.error?.code, '23514');
  });
});

describe('customer and rider photos on a delivery', () => {
  let order;

  before(async () => {
    order = await placeOnlineOrder('customer', { fulfillment_type: 'delivery', delivery_address: ADDRESS });
    deliveryOrderIds.push(order.id);
  });

  it('are refused until a rider has the order', async () => {
    const res = await post(`/orders/${order.id}/chat/images`, PNG, { ...png, token: customer });
    assert.equal(res.status, 409);
  });

  it('work both ways while it is out for delivery', async () => {
    await setOrderState(order.id, { status: 'ready' });
    assert.equal((await post(`/rider/orders/${order.id}/claim`, undefined, { token: rider })).status, 200);

    const fromCustomer = await post(`/orders/${order.id}/chat/images`, PNG, { ...png, token: customer });
    assert.equal(fromCustomer.status, 201);
    assert.equal(fromCustomer.body.data.sender_role, 'customer');
    assert.ok(fromCustomer.body.data.image_url);

    const fromRider = await post(`/rider/orders/${order.id}/chat/images`, PNG, { ...png, token: rider });
    assert.equal(fromRider.status, 201);
    assert.equal(fromRider.body.data.sender_role, 'rider');

    const asRider = await get(`/rider/orders/${order.id}/chat`, { token: rider });
    const photos = asRider.body.data.messages.filter((m) => m.image_url);
    assert.equal(photos.length, 2);
    for (const photo of photos) assert.equal((await fetchImage(photo.image_url)).status, 200);

    const asCustomer = await get(`/orders/${order.id}/chat`, { token: customer });
    assert.equal(asCustomer.body.data.messages.filter((m) => m.image_url).length, 2);
  });

  it('are invisible to other customers and riders', async () => {
    assert.equal((await post(`/orders/${order.id}/chat/images`, PNG, { ...png, token: customer2 })).status, 404);

    const other = await placeOnlineOrder('customer', { fulfillment_type: 'delivery', delivery_address: ADDRESS });
    assert.equal((await post(`/rider/orders/${other.id}/chat/images`, PNG, { ...png, token: rider })).status, 404);
  });

  it('require a login and a real image', async () => {
    assert.equal((await post(`/orders/${order.id}/chat/images`, PNG, png)).status, 401);
    assert.equal(
      (await post(`/orders/${order.id}/chat/images`, Buffer.from('not an image'), { ...png, token: customer })).status,
      400,
    );
  });

  it('close once the delivery is finished, but the photos stay viewable', async () => {
    await setOrderState(order.id, { status: 'completed' });

    assert.equal((await post(`/orders/${order.id}/chat/images`, PNG, { ...png, token: customer })).status, 409);
    assert.equal((await post(`/rider/orders/${order.id}/chat/images`, PNG, { ...png, token: rider })).status, 409);

    const history = await get(`/orders/${order.id}/chat`, { token: customer });
    assert.equal(history.body.data.messages.filter((m) => m.image_url).length, 2);
  });
});
