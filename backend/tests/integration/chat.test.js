import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { get, post } from '../helpers/client.js';
import { tokenFor } from '../helpers/auth.js';
import { db, setOrderState } from '../helpers/db.js';
import { branchId, cleanup, placeOnlineOrder } from '../helpers/fixtures.js';

// Opening a thread is limited to 5 per hour per IP, and the limiter runs before
// validation, so every POST /chat/visitor/threads here counts. This file budgets
// them: 1 main thread + 1 validation probe + the rate-limit test takes the rest.

const ADDRESS = { line1: '9 Mabini St', city: 'Davao City' };
const visitorHeaders = (token) => ({ 'X-Chat-Token': token });

const threadIds = [];
let cashier;
let customer;
let customer2;
let rider;
let visitor; // { thread_id, token }

before(async () => {
  [cashier, customer, customer2, rider] = await Promise.all([
    tokenFor('cashier'),
    tokenFor('customer'),
    tokenFor('customer2'),
    tokenFor('rider'),
  ]);
});

after(async () => {
  await cleanup(); // delivery threads cascade from their order
  if (threadIds.length) await db.from('chat_threads').delete().in('id', threadIds);
});

const openThread = async (body = 'Hello, are you open?', name) => {
  const res = await post('/chat/visitor/threads', { branch_id: await branchId(), body, ...(name ? { name } : {}) });
  if (res.status === 201) threadIds.push(res.body.data.thread_id);
  return res;
};

describe('visitor support chat', () => {
  it('opens a thread with the first message and returns a one-time token', async () => {
    const res = await openThread('Hello, are you open?', 'Maria');

    assert.equal(res.status, 201);
    visitor = res.body.data;
    assert.match(visitor.token, /^chat_/);
    assert.equal(visitor.messages.length, 1);
    assert.equal(visitor.messages[0].sender_role, 'visitor');
  });

  it('never stores the token itself', async () => {
    const { data } = await db.from('chat_thread_secrets').select('token_hash').eq('thread_id', visitor.thread_id).single();
    assert.notEqual(data.token_hash, visitor.token);
  });

  it('rejects an empty message', async () => {
    const res = await post('/chat/visitor/threads', { branch_id: await branchId(), body: '   ' });
    assert.equal(res.status, 400);
  });

  it('lets the visitor read and send with the token', async () => {
    const send = await post(
      `/chat/visitor/threads/${visitor.thread_id}/messages`,
      { body: 'Do you deliver to Toril?' },
      { headers: visitorHeaders(visitor.token) },
    );
    assert.equal(send.status, 201);

    const list = await get(`/chat/visitor/threads/${visitor.thread_id}/messages`, {
      headers: visitorHeaders(visitor.token),
    });
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 2);
    assert.equal('sender_id' in list.body.data[0], false);
  });

  it('401s a missing or wrong token, identically for unknown threads', async () => {
    const path = `/chat/visitor/threads/${visitor.thread_id}/messages`;
    assert.equal((await get(path)).status, 401);
    assert.equal((await get(path, { headers: visitorHeaders('chat_wrong') })).status, 401);
    assert.equal(
      (await post(path, { body: 'hi' }, { headers: visitorHeaders('chat_wrong') })).status,
      401,
    );

    const unknown = await get('/chat/visitor/threads/00000000-0000-0000-0000-000000000000/messages', {
      headers: visitorHeaders(visitor.token),
    });
    assert.equal(unknown.status, 401);
  });

  it('shows the cashier an unread thread and lets them reply', async () => {
    const inbox = await get('/pos/chat/threads', { token: cashier });
    assert.equal(inbox.status, 200);
    const thread = inbox.body.data.find((t) => t.id === visitor.thread_id);
    assert.ok(thread);
    assert.equal(thread.visitor_name, 'Maria');
    assert.equal(typeof thread.guest_number, 'number');
    assert.equal(thread.display_name, `Maria (Guest-${thread.guest_number})`);
    assert.equal(thread.unread, true);
    assert.equal(thread.last_sender_role, 'visitor');

    const history = await get(`/pos/chat/threads/${visitor.thread_id}/messages`, { token: cashier });
    assert.equal(history.body.data.length, 2);

    const reply = await post(
      `/pos/chat/threads/${visitor.thread_id}/messages`,
      { body: 'Yes, we deliver to Toril!' },
      { token: cashier },
    );
    assert.equal(reply.status, 201);
    assert.equal(reply.body.data.sender_role, 'cashier');
  });

  it('shows the visitor the cashier reply', async () => {
    const list = await get(`/chat/visitor/threads/${visitor.thread_id}/messages`, {
      headers: visitorHeaders(visitor.token),
    });
    assert.equal(list.body.data.at(-1).sender_role, 'cashier');
  });

  it('clears the unread flag once the cashier has read it', async () => {
    const read = await post(`/pos/chat/threads/${visitor.thread_id}/read`, undefined, { token: cashier });
    assert.equal(read.status, 204);

    const inbox = await get('/pos/chat/threads', { token: cashier });
    assert.equal(inbox.body.data.find((t) => t.id === visitor.thread_id).unread, false);
  });

  it('numbers each anonymous guest so several can be told apart', async () => {
    const { data } = await db.from('chat_threads').insert({ kind: 'support', branch_id: await branchId() }).select('id, guest_number').single();
    threadIds.push(data.id);
    const { data: other } = await db.from('chat_threads').insert({ kind: 'support', branch_id: await branchId() }).select('id, guest_number').single();
    threadIds.push(other.id);
    await db.from('chat_messages').insert([
      { thread_id: data.id, sender_role: 'visitor', body: 'first' },
      { thread_id: other.id, sender_role: 'visitor', body: 'second' },
    ]);
    assert.ok(other.guest_number > data.guest_number, 'numbers keep increasing');

    const inbox = await get('/pos/chat/threads', { token: cashier });
    const names = inbox.body.data.filter((t) => [data.id, other.id].includes(t.id)).map((t) => t.display_name);
    assert.deepEqual(names.sort(), [`Guest-${data.guest_number}`, `Guest-${other.guest_number}`].sort());
  });

  it('keeps the inbox to staff', async () => {
    assert.equal((await get('/pos/chat/threads')).status, 401);
    assert.equal((await get('/pos/chat/threads', { token: customer })).status, 403);
    assert.equal((await get('/pos/chat/threads', { token: rider })).status, 403);
  });

  it('pings the visitor channel so the browser refetches live', async () => {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false },
    });
    const channel = client.channel(`chat:${visitor.thread_id}`);

    const ping = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no broadcast within 8s')), 8000);
      channel.on('broadcast', { event: 'message' }, (msg) => {
        clearTimeout(timer);
        resolve(msg.payload);
      });
    });
    await new Promise((resolve, reject) =>
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status));
      }),
    );

    try {
      await post(
        `/pos/chat/threads/${visitor.thread_id}/messages`,
        { body: 'Anything else?' },
        { token: cashier },
      );
      const payload = await ping;
      // A ping must never carry the message itself.
      assert.deepEqual(payload, { thread_id: visitor.thread_id });
    } finally {
      await client.removeChannel(channel);
    }
  });
});

describe('delivery chat', () => {
  let order;

  const deliveryOrder = () =>
    placeOnlineOrder('customer', { fulfillment_type: 'delivery', delivery_address: ADDRESS });

  before(async () => {
    order = await deliveryOrder();
  });

  it('is closed with no thread until a rider takes the order', async () => {
    const res = await get(`/orders/${order.id}/chat`, { token: customer });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.thread_id, null);
    assert.equal(res.body.data.open, false);
    assert.deepEqual(res.body.data.messages, []);

    const send = await post(`/orders/${order.id}/chat`, { body: 'hello?' }, { token: customer });
    assert.equal(send.status, 409);
  });

  it('opens for the customer and the claiming rider while out for delivery', async () => {
    await setOrderState(order.id, { status: 'ready' });
    const claim = await post(`/rider/orders/${order.id}/claim`, undefined, { token: rider });
    assert.equal(claim.status, 200);

    const opened = await get(`/orders/${order.id}/chat`, { token: customer });
    assert.equal(opened.body.data.open, true);
    assert.ok(opened.body.data.thread_id);
    assert.equal(opened.body.data.with.role, 'rider');

    const fromCustomer = await post(`/orders/${order.id}/chat`, { body: 'Gate is blue.' }, { token: customer });
    assert.equal(fromCustomer.status, 201);
    assert.equal(fromCustomer.body.data.sender_role, 'customer');

    const riderView = await get(`/rider/orders/${order.id}/chat`, { token: rider });
    assert.equal(riderView.body.data.with.role, 'customer');
    assert.equal(riderView.body.data.messages.length, 1);

    const fromRider = await post(`/rider/orders/${order.id}/chat`, { body: 'On my way.' }, { token: rider });
    assert.equal(fromRider.body.data.sender_role, 'rider');

    const both = await get(`/orders/${order.id}/chat`, { token: customer });
    assert.deepEqual(
      both.body.data.messages.map((m) => m.sender_role),
      ['customer', 'rider'],
    );
  });

  it('is invisible to other customers and to riders who do not hold the order', async () => {
    assert.equal((await get(`/orders/${order.id}/chat`, { token: customer2 })).status, 404);
    assert.equal(
      (await post(`/orders/${order.id}/chat`, { body: 'hi' }, { token: customer2 })).status,
      404,
    );

    const other = await deliveryOrder();
    assert.equal((await get(`/rider/orders/${other.id}/chat`, { token: rider })).status, 404);
  });

  it('stays readable but closes to new messages once delivered', async () => {
    await setOrderState(order.id, { status: 'completed' });

    const read = await get(`/orders/${order.id}/chat`, { token: customer });
    assert.equal(read.status, 200);
    assert.equal(read.body.data.open, false);
    assert.equal(read.body.data.messages.length, 2);

    assert.equal((await post(`/orders/${order.id}/chat`, { body: 'thanks' }, { token: customer })).status, 409);
    assert.equal((await post(`/rider/orders/${order.id}/chat`, { body: 'np' }, { token: rider })).status, 409);
  });

  it('does not exist for pickup orders', async () => {
    const pickup = await placeOnlineOrder('customer', { fulfillment_type: 'pickup' });
    assert.equal((await get(`/orders/${pickup.id}/chat`, { token: customer })).status, 404);
  });

  it('requires a login', async () => {
    assert.equal((await get(`/orders/${order.id}/chat`)).status, 401);
    assert.equal((await get(`/rider/orders/${order.id}/chat`)).status, 401);
  });
});

describe('chat rate limiting', () => {
  it('429s when too many conversations are started', async () => {
    const statuses = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await openThread(`spam ${i}`)).status);

    assert.equal(statuses.at(-1), 429);
    assert.ok(statuses.includes(201), 'some are allowed before the limit');
  });
});
