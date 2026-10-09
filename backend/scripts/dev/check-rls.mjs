// Verifies that each role sees exactly its permitted slice of orders, by
// querying Postgres directly as that user — the same way Supabase Realtime
// does.
//
// This is the only check of the cashier and rider RLS policies. The API's
// staff routes use the secret-key client, which bypasses RLS, so the test
// suite exercising those routes says nothing about what a POS or rider app's
// live subscription will actually receive. A Realtime subscription delivers
// precisely the rows a plain select returns for that user; if this passes,
// the live feeds are scoped correctly.
//
//   node --env-file=.env scripts/dev/check-rls.mjs
//
// Self-contained: it creates the orders it needs and deletes them afterwards,
// so it works on an empty database and leaves nothing behind. Fixtures are made
// at GMA Terminal; the Imus staff from scripts/dev/seed-test-users.mjs must see
// none of them (branch isolation).
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const TEST_PASSWORD = 'testpass12345';

const admin = createClient(URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const login = async (email, password = TEST_PASSWORD) => {
  if (!password) throw new Error(`No password for ${email} — run scripts/seed-accounts.mjs`);
  const client = createClient(URL, KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${email}: ${error.message}`);
  return { client, id: data.user.id };
};

const fmt = (numbers) => [...numbers].sort().join(', ') || '(none)';

// Order numbers repeat across branches, so rows are compared by id.
const visible = async (client) => {
  const { data, error } = await client.from('orders').select('id');
  return error ? `ERROR ${error.message}` : fmt(data.map((o) => o.id));
};

let pass = true;
const expect = (label, actual, wanted) => {
  const ok = actual === wanted;
  pass &&= ok;
  console.log(`${ok ? '✓' : '✗'} ${label.padEnd(44)} ${actual}${ok ? '' : `   [expected: ${wanted}]`}`);
};

const [c1, c2, cashier, adminUser, rider, imusCashier, imusAdmin, imusRider] = await Promise.all([
  login('customer@3k.local'),
  login('customer2@3k.local'),
  login('cashier@3k.local', process.env.TEST_CASHIER_PASSWORD ?? process.env.CASHIER_PASSWORD),
  login('admin@3k.local', process.env.TEST_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD),
  login('rider1@3k.local'),
  login('cashier.imus@3k.local'),
  login('admin.imus@3k.local'),
  login('rider.imus@3k.local'),
]);
const anon = createClient(URL, KEY, { auth: { persistSession: false } });

// --- fixtures ---------------------------------------------------------------
const { data: product } = await admin
  .from('products').select('id, price').not('price', 'is', null).limit(1).single();

const branchIdOf = async (code) => (await admin.from('branches').select('id').eq('code', code).single()).data.id;
const gma = await branchIdOf('gma');
const imus = await branchIdOf('imus');

const created = [];
const createdThreads = [];
const makeOrder = async (fields) => {
  const { data, error } = await admin
    .from('orders')
    .insert({ branch_id: gma, channel: 'online', status: 'pending', total_amount: product.price, ...fields })
    .select('id, order_number')
    .single();
  if (error) throw error;
  await admin.from('order_items').insert({
    order_id: data.id, product_id: product.id, quantity: 1, unit_price: product.price,
  });
  created.push(data.id);
  return data;
};

// rider1 may have real past deliveries (and their chats); those stay visible to
// them, so the rider expectations are measured against that starting point.
const riderHistory = (await admin.from('orders').select('id').eq('rider_id', rider.id)).data.map((o) => o.id);
const riderSees = (...ids) => fmt([...riderHistory, ...ids]);

try {
  const c1Pickup = await makeOrder({ customer_id: c1.id, fulfillment_type: 'pickup', customer_name: 'RLS C1' });
  const c2Pickup = await makeOrder({ customer_id: c2.id, fulfillment_type: 'pickup', customer_name: 'RLS C2' });
  const delivery = await makeOrder({
    customer_id: c1.id,
    fulfillment_type: 'delivery',
    customer_name: 'RLS Delivery',
    delivery_address: { line1: '1 RLS St', city: 'Davao City' },
  });

  // Other rows may already exist, so every expectation is derived from what is
  // actually in the database — never from the fixtures alone. A customer owns
  // whatever rows carry their id, fixtures or not.
  const { data: every } = await admin.from('orders').select('id, customer_id, branch_id');
  const all = fmt(every.map((o) => o.id));
  const atBranch = (branch) => fmt(every.filter((o) => o.branch_id === branch).map((o) => o.id));
  const ownedBy = (id) => fmt(every.filter((o) => o.customer_id === id).map((o) => o.id));
  const c1Own = ownedBy(c1.id);
  const c2Own = ownedBy(c2.id);

  console.log('--- customers ---');
  expect('customer 1 sees only their own', await visible(c1.client), c1Own);
  expect('customer 2 sees only their own', await visible(c2.client), c2Own);

  console.log('--- staff (these policies scope the POS live feed) ---');
  expect('GMA cashier sees every GMA order', await visible(cashier.client), atBranch(gma));
  expect('Imus cashier sees every Imus order only', await visible(imusCashier.client), atBranch(imus));
  expect('Imus admin sees every Imus order only', await visible(imusAdmin.client), atBranch(imus));
  expect('super admin sees every order', await visible(adminUser.client), all);

  console.log('--- anonymous ---');
  expect('anonymous sees nothing', await visible(anon), '(none)');

  console.log('--- rider (these policies scope the rider live feed) ---');
  expect('rider sees only their history while delivery is pending', await visible(rider.client), riderSees());

  await admin.from('orders').update({ status: 'ready' }).eq('id', delivery.id);
  expect('rider sees it once ready and unclaimed', await visible(rider.client), riderSees(delivery.id));
  expect("another branch's rider never sees it", await visible(imusRider.client), '(none)');
  expect('rider never sees a pickup order', (await visible(rider.client)).includes(c1Pickup.order_number) ? 'leaked' : 'ok', 'ok');

  await admin.from('orders').update({ status: 'out_for_delivery', rider_id: rider.id }).eq('id', delivery.id);
  expect('rider still sees it after claiming', await visible(rider.client), riderSees(delivery.id));

  // --- chat: what Realtime delivers for threads and messages ---
  const chatVisible = async (client) => {
    const [threads, messages] = await Promise.all([
      client.from('chat_threads').select('id'),
      client.from('chat_messages').select('id'),
    ]);
    if (threads.error || messages.error) return `ERROR ${(threads.error ?? messages.error).message}`;
    return `${threads.data.length} threads, ${messages.data.length} messages`;
  };

  // Chats of the rider's past deliveries, which they keep.
  const riderChatBase = await chatVisible(rider.client);
  const plusOne = (counts) => counts.replace(/^(\d+) threads, (\d+) messages$/, (_, t, m) => `${+t + 1} threads, ${+m + 1} messages`);

  const { data: deliveryThread } = await admin
    .from('chat_threads').insert({ kind: 'delivery', order_id: delivery.id, branch_id: gma }).select('id').single();
  const { data: supportThread } = await admin
    .from('chat_threads').insert({ kind: 'support', visitor_name: 'RLS Visitor', branch_id: gma }).select('id').single();
  createdThreads.push(deliveryThread.id, supportThread.id);
  await admin.from('chat_messages').insert([
    { thread_id: deliveryThread.id, sender_role: 'customer', body: 'rls delivery' },
    { thread_id: supportThread.id, sender_role: 'visitor', body: 'rls support' },
  ]);

  // Other threads may already exist, so staff expectations come from the database.
  const chatCounts = async (branch) => {
    const threads = admin.from('chat_threads').select('*', { count: 'exact', head: true });
    const messages = admin.from('chat_messages').select('id, thread:chat_threads!inner(branch_id)', { count: 'exact', head: true });
    const [{ count: t }, { count: m }] = await Promise.all(
      branch ? [threads.eq('branch_id', branch), messages.eq('thread.branch_id', branch)] : [threads, messages],
    );
    return `${t} threads, ${m} messages`;
  };

  console.log('--- chat ---');
  expect('GMA cashier sees every GMA thread and message', await chatVisible(cashier.client), await chatCounts(gma));
  expect('Imus cashier sees only Imus chat', await chatVisible(imusCashier.client), await chatCounts(imus));
  expect('super admin sees every thread and message', await chatVisible(adminUser.client), await chatCounts(null));
  expect('anonymous sees no chat', await chatVisible(anon), '0 threads, 0 messages');
  expect('order owner sees only their delivery chat', await chatVisible(c1.client), '1 threads, 1 messages');
  expect('another customer sees no chat', await chatVisible(c2.client), '0 threads, 0 messages');
  expect('rider holding the order sees its chat', await chatVisible(rider.client), plusOne(riderChatBase));

  await admin.from('orders').update({ rider_id: null, status: 'ready' }).eq('id', delivery.id);
  expect('rider loses the chat once the order is released', await chatVisible(rider.client), riderChatBase);
  await admin.from('orders').update({ status: 'out_for_delivery', rider_id: rider.id }).eq('id', delivery.id);

  await admin.from('orders').update({ status: 'completed' }).eq('id', delivery.id);
  expect('rider keeps it in their history', await visible(rider.client), riderSees(delivery.id));

  expect('customer 1 unaffected throughout', await visible(c1.client), c1Own);
} finally {
  if (createdThreads.length) await admin.from('chat_threads').delete().in('id', createdThreads);
  if (created.length) await admin.from('orders').delete().in('id', created);
}

console.log(`\n${pass ? 'ALL RLS CHECKS PASSED' : 'SOME CHECKS FAILED'}`);
process.exit(pass ? 0 : 1);
