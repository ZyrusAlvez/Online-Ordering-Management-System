// @ts-nocheck -- a test script: it pokes at failure results without narrowing them first.
// End-to-end check of the order, payment, rider, chat and profile flows, run through the app's own
// controllers as the @3k.local test accounts (docs/credentials.md).
//
// It WRITES to the Supabase project in .env.local: a few test orders at GMA Terminal (left voided,
// refunded, cancelled or completed), chat messages, and for check-server a kiosk device it then revokes.
//
//   npm run check:flows


const { supabase } = await import('@/utils/supabase');
const order = await import('@/controllers/orderController');
const pay = await import('@/controllers/paymentController');
const rider = await import('@/controllers/riderController');
const chat = await import('@/controllers/chatController');
const profile = await import('@/controllers/profileController');
const branchCtl = await import('@/controllers/branchController');
const menu = await import('@/controllers/menuController');
const { isOpenNow } = await import('@/utils/geo');

let failures = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${JSON.stringify(detail)}`}`);
};
const as = async (email: string, password: string) => {
  await supabase.auth.signOut({ scope: 'local' });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
};
const CUSTOMER = ['customer1@3k.local', 'customer-1'] as const;
const CUSTOMER2 = ['customer2@3k.local', 'customer-2'] as const;
const CASHIER = ['cashier.gma@3k.local', 'cashier-gma'] as const;
const ADMIN = ['admin.gma@3k.local', 'admin-gma'] as const;
const RIDER = ['rider.gma@3k.local', 'rider-gma'] as const;

// --- setup: GMA branch and one plain priced product -------------------------------------
const branches = await branchCtl.getActiveBranches();
const gma = branches.success ? branches.data.find((b) => b.code === 'gma')! : null!;
const m = await menu.getMenu({ branchId: gma.id });
const product = m.success
  ? m.data.flatMap((c) => c.products).find((p) => p.is_available && p.price != null && p.variants.length === 0)!
  : null!;
const price = Number(product.price);
console.log(`using ${gma.name}, product "${product.name}" @ ${price}`);

/** ASAP while open, else the first slot tomorrow at 10:00 Manila. */
const placeOnline = async (extra: Record<string, unknown>) => {
  const base = { branch_id: gma.id, items: [{ product_id: product.id, quantity: 2 }], ...extra };
  const now = await order.placeOnlineOrder(base);
  if (now.success || now.status !== 409) return now;
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(Date.now() + 86_400_000));
  return order.placeOnlineOrder({ ...base, scheduled_for: `${d}T10:00:00+08:00` });
};

// --- 1. customer: GCash pickup order, tampering, proof -----------------------------------
await as(...CUSTOMER);
const o1 = await placeOnline({ fulfillment_type: 'pickup', payment_method: 'gcash' });
check('customer places online order', o1.success, o1);
const id1 = o1.success ? o1.data.id : '';
check('total priced from menu', o1.success && Number(o1.data.total_amount) === price * 2, o1.success && o1.data.total_amount);
check('order number assigned', o1.success && /^O-\d+/.test(o1.data.order_number), o1.success && o1.data.order_number);

const t1 = await supabase.from('orders').update({ payment_status: 'paid' }).eq('id', id1).select();
check('customer cannot mark own order paid', Boolean(t1.error) || (t1.data ?? []).length === 0, t1);
const t2 = await supabase.from('orders').update({ total_amount: 1 }).eq('id', id1).select('total_amount').single();
check('customer cannot change the total', !t2.error && Number(t2.data?.total_amount) === price * 2, t2);

// The ordering rules hold even when the app's own checks are skipped (a direct API call).
{
  const uid = (await supabase.auth.getUser()).data.user.id;
  const manilaDay = (days: number) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(Date.now() + days * 86_400_000));
  const direct = (extra: Record<string, unknown>) =>
    supabase.from('orders').insert({
      branch_id: gma.id, channel: 'online', customer_id: uid, fulfillment_type: 'pickup', payment_method: 'cash',
      scheduled_for: `${manilaDay(1)}T10:00:00+08:00`, ...extra,
    }).select('id');
  const refused = (r, text: string) => r.error?.code === 'P0001' && r.error.message.includes(text);

  const noAddress = await direct({ fulfillment_type: 'delivery' });
  check('database refuses a delivery with no address', refused(noAddress, 'address'), noAddress.error ?? noAddress.data);
  const offMark = await direct({ scheduled_for: `${manilaDay(1)}T10:07:00+08:00` });
  check('database refuses a time off the 15-minute mark', refused(offMark, '15-minute'), offMark.error ?? offMark.data);
  const tooFar = await direct({ scheduled_for: `${manilaDay(4)}T10:00:00+08:00` });
  check('database refuses a time more than 2 days ahead', refused(tooFar, '2 days'), tooFar.error ?? tooFar.data);
  const soon = new Date(Math.ceil(Date.now() / 900_000) * 900_000); // the next 15-minute mark
  const tooSoon = await direct({ scheduled_for: soon.toISOString() });
  check('database refuses a time under 30 minutes away', refused(tooSoon, '30 minutes'), tooSoon.error ?? tooSoon.data);
  if (!isOpenNow(gma)) {
    const asap = await direct({ scheduled_for: null });
    check('database refuses an ASAP order while the branch is closed', refused(asap, 'closed now'), asap.error ?? asap.data);
  }
  if (gma.opens_at && gma.closes_at && gma.opens_at.slice(0, 5) > '03:00') {
    const night = await direct({ scheduled_for: `${manilaDay(1)}T03:00:00+08:00` });
    check('database refuses a time outside the branch hours', refused(night, 'closed at that time'), night.error ?? night.data);
  }
}

const proof = await pay.submitGcashProof(id1, { reference_number: '1234 567 890123' });
check('customer submits GCash reference', proof.success && proof.data.payment_status === 'processing', proof);

await as(...CUSTOMER2);
const peek = await order.getOrder(id1);
check("another customer cannot see the order", !peek.success && peek.status === 404, peek);

// --- 2. cashier verifies, voids; admin refunds -------------------------------------------
await as(...CASHIER);
const v = await pay.verifyGcash(id1, { approve: true });
check('cashier approves GCash', v.success && v.data.payment_status === 'paid', v);
const vo = await pay.voidOrder(id1, { reason: 'Flow test: customer changed mind' });
check('cashier voids paid GCash order -> refund pending', vo.success && vo.data.refund_pending === true && vo.data.order.payment_status === 'refund_pending', vo);

await as(...ADMIN);
const rf = await pay.markRefunded(id1);
check('branch admin marks refunded', rf.success && rf.data.payment_status === 'refunded', rf);

// --- 3. delivery: kitchen pipeline, rider claim, chat, cash on delivery -------------------
await as(...CUSTOMER);
const o2 = await placeOnline({
  fulfillment_type: 'delivery',
  payment_method: 'cash',
  customer_phone: '09171234567',
  delivery_address: { line1: '1 Flow Test St', city: 'General Mariano Alvarez' },
});
check('customer places delivery order', o2.success, o2);
const id2 = o2.success ? o2.data.id : '';

await as(...CASHIER);
const jump = await order.advanceStatus(id2, 'ready');
check('a new order cannot skip the kitchen (409)', !jump.success && jump.status === 409, jump);
for (const step of ['preparing', 'ready']) {
  const r = await order.advanceStatus(id2, step);
  check(`cashier moves order to ${step}`, r.success && r.data.status === step, r);
}
const skip = await order.advanceStatus(id2, 'pending');
check('illegal transition is refused (409)', !skip.success && skip.status === 409, skip);

await as(...RIDER);
const pool = await rider.getPool();
check('order appears in rider pool', pool.success && pool.data.some((x) => x.id === id2), pool.success && pool.data.length);
const cl = await rider.claimOrder(id2);
check('rider claims', cl.success && cl.data.status === 'out_for_delivery', cl);
check('total survives the claim', cl.success && Number(cl.data.total_amount) === price * 2, cl.success && cl.data.total_amount);
const cl2 = await rider.claimOrder(id2);
check('second claim loses (409)', !cl2.success && cl2.status === 409, cl2);
const rm = await chat.postOrderMessage(id2, 'rider', { body: 'On my way (flow test)' });
check('rider sends chat message', rm.success, rm);

await as(...CUSTOMER);
const cm = await chat.postOrderMessage(id2, 'customer', { body: 'Thanks! (flow test)' });
check('customer replies in chat', cm.success, cm);
const thread = await chat.getOrderChat(id2, 'customer');
check('customer sees both messages and rider name', thread.success && thread.data.messages.length >= 2 && thread.data.with.name !== undefined, thread.success && { n: thread.data.messages.length, with: thread.data.with });
const imus = branches.success ? branches.data.find((b) => b.code === 'imus') : null;
const thr = await supabase.from('chat_threads').select('id').eq('order_id', id2).single();
const moved = await supabase.from('chat_threads').update({ branch_id: imus.id }).eq('id', thr.data?.id).select();
check('customer cannot move the delivery chat to another branch', Boolean(moved.error) || (moved.data ?? []).length === 0, moved);
const marked = await supabase.from('chat_threads').update({ staff_read_at: new Date().toISOString() }).eq('id', thr.data?.id).select();
check('customer cannot mark the chat read for staff', Boolean(marked.error) || (marked.data ?? []).length === 0, marked);

await as(...RIDER);
const short = await rider.markDelivered(id2, { collected_amount: price });
check('short cash is refused', !short.success, short);
const dl = await rider.markDelivered(id2, { collected_amount: price * 2 + 100 });
check('rider delivers with cash collected', dl.success && dl.data.status === 'completed' && dl.data.payment_status === 'paid', dl);

// --- 4. customer cancel, item tampering ---------------------------------------------------
await as(...CUSTOMER);
const o3 = await placeOnline({ fulfillment_type: 'pickup', payment_method: 'cash' });
const id3 = o3.success ? o3.data.id : '';
const added = await supabase.from('order_items').insert({ order_id: id3, product_id: product.id, quantity: 1, unit_price: 0.01 }).select('unit_price');
check('customer cannot add items to an order already placed', Boolean(added.error), added);
const after = await order.getOrder(id3);
check('total is unchanged', after.success && Number(after.data.total_amount) === price * 2, after.success && after.data.total_amount);
const cn = await order.cancelMyOrder(id3);
check('customer cancels unpaid order', cn.success && cn.data.status === 'cancelled', cn);

// Placing an order straight through the database (skipping the app): the price and the timestamp
// sent are replaced, and the order cannot be added to afterwards.
const me = (await supabase.auth.getUser()).data.user;
// Scheduled for tomorrow 10:00, so the branch's hours never refuse it (that rule is checked above).
const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(Date.now() + 86_400_000));
const raw = await supabase
  .from('orders')
  .insert({ branch_id: gma.id, channel: 'online', fulfillment_type: 'pickup', customer_id: me.id, customer_name: 'Flow Test', payment_method: 'cash', total_amount: 1, scheduled_for: `${tomorrow}T10:00:00+08:00` })
  .select('id')
  .single();
const rawItems = await supabase
  .from('order_items')
  .insert({ order_id: raw.data?.id, product_id: product.id, quantity: 1, unit_price: 0.01, created_at: '2099-01-01T00:00:00Z' })
  .select('unit_price, created_at')
  .single();
check(
  'a tampered price and timestamp are replaced when the order is placed',
  !rawItems.error && Number(rawItems.data?.unit_price) === price && rawItems.data?.created_at < '2099',
  rawItems,
);
const later = await supabase.from('order_items').insert({ order_id: raw.data?.id, product_id: product.id, quantity: 1 }).select();
check('…and nothing can be added to it afterwards', Boolean(later.error), later);
const rawOrder = await order.getOrder(raw.data?.id);
check('its total follows the items, not what was sent', rawOrder.success && Number(rawOrder.data.total_amount) === price, rawOrder.success && rawOrder.data.total_amount);
await order.cancelMyOrder(raw.data?.id);

// --- 5. POS walk-in with cash and change -----------------------------------------------------
await as(...CASHIER);
const w = await order.createWalkInOrder({
  branch_id: gma.id,
  fulfillment_type: 'take_out',
  customer_name: 'Flow Test',
  payment_method: 'cash',
  items: [{ product_id: product.id, quantity: 1 }],
});
check('cashier creates walk-in order', w.success && w.data.channel === 'pos', w);
const edited = await order.replaceItems(w.success ? w.data.id : '', { items: [{ product_id: product.id, quantity: 2 }] });
check('cashier can still edit items before payment', edited.success && Number(edited.data.total_amount) === price * 2, edited);
const wid = w.success ? w.data.id : '';
const early = await order.advanceStatus(wid, 'preparing');
check('an unpaid walk-in cannot go to the kitchen (409)', !early.success && early.status === 409 && /payment/i.test(early.error), early);
const earlyDb = await supabase.from('orders').update({ status: 'preparing' }).eq('id', wid).select('status');
check('…not even by a direct database update', earlyDb.error?.code === 'P0001', earlyDb.error ?? earlyDb.data);
const cash = await pay.payCash(wid, { tendered_amount: price * 2 + 50 });
check('cashier takes cash, change computed', cash.success && cash.data.change === 50, cash);
for (const step of ['preparing', 'ready', 'completed']) {
  const r = await order.advanceStatus(wid, step);
  check(`paid walk-in moves to ${step}`, r.success && r.data.status === step, r);
}
const q = await order.listStaffOrders({ branch_id: gma.id, limit: 5 });
check('POS queue lists branch orders', q.success && q.data.data.length > 0, q);

// --- 6. profile, sold out -----------------------------------------------------------------
await as(...CUSTOMER);
const before = await profile.getMyProfile();
const pu = await profile.updateMyProfile({ phone: '09170000000' });
check('customer updates own profile', pu.success && pu.data.phone === '09170000000', pu);
await profile.updateMyProfile({ phone: before.success ? before.data.phone : null });
const role = await supabase.from('profiles').update({ role: 'super_admin' }).eq('id', before.success ? before.data.id : '');
check('customer cannot change own role', Boolean(role.error), role);

await as(...ADMIN);
const so = await branchCtl.setSoldOut(gma.id, product.id, true);
const back = await branchCtl.setSoldOut(gma.id, product.id, false);
check('branch admin toggles sold out', so.success && back.success, { so, back });

await supabase.auth.signOut({ scope: 'local' });
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
console.log('test orders:', [id1, id2, id3, w.success ? w.data.id : null].join(' '));

export {};
