// Exercises the PayMongo webhook receiver: signature verification, replay
// rejection, idempotency, and the kiosk auto-confirm rule.
//
// Needs no PayMongo account — it signs payloads with the same secret the
// server was started with. Run the server with:
//   PAYMONGO_WEBHOOK_SECRET=whsk_testsecret123 node --env-file=.env src/server.js
import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SECRET = 'whsk_testsecret123';
const ENDPOINT = 'http://localhost:4000/api/v1/webhooks/paymongo';
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? '  ' + detail : ''}`);
  ok ? pass++ : fail++;
};

const send = (body, { secret = SECRET, timestamp = Math.floor(Date.now() / 1000), tamper = false } = {}) => {
  const raw = JSON.stringify(body);
  const sig = createHmac('sha256', secret).update(`${timestamp}.${raw}`, 'utf8').digest('hex');
  return fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Paymongo-Signature': `t=${timestamp},te=${sig},li=${sig}`,
    },
    body: tamper ? raw.replace('payment.paid', 'payment.failed') : raw,
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
};

const evt = (id, type, resource) => ({
  data: { id, type: 'event', attributes: { type, data: resource } },
});

// Seed a kiosk GCash order in exactly the state startGcashPayment leaves it.
const { data: product } = await db
  .from('products').select('id, price').not('price', 'is', null).limit(1).single();

const { data: order } = await db.from('orders').insert({
  channel: 'kiosk', fulfillment_type: 'take_out', customer_name: 'Webhook Test',
  status: 'pending', payment_status: 'processing', payment_method: 'gcash',
  total_amount: product.price,
}).select().single();

await db.from('order_items').insert({
  order_id: order.id, product_id: product.id, quantity: 1, unit_price: product.price,
});

const intentId = `pi_test_${Date.now()}`;
await db.from('payments').insert({
  order_id: order.id, provider: 'paymongo', intent_id: intentId,
  amount_centavos: Math.round(product.price * 100), status: 'processing',
});
console.log(`seeded kiosk order ${order.order_number} (pending/processing)\n`);

const paid = {
  id: `pay_test_${Date.now()}`,
  type: 'payment',
  attributes: { payment_intent_id: intentId, status: 'paid', metadata: { order_id: order.id } },
};

console.log('--- signature verification ---');
let r = await send(evt('evt_bad_secret', 'payment.paid', paid), { secret: 'whsk_wrong' });
check('wrong signing secret rejected', r.status === 401, `${r.status}`);

r = await send(evt('evt_tampered', 'payment.paid', paid), { tamper: true });
check('tampered body rejected', r.status === 401, `${r.status}`);

r = await send(evt('evt_old', 'payment.paid', paid), { timestamp: Math.floor(Date.now() / 1000) - 3600 });
check('stale timestamp rejected (replay)', r.status === 401, `${r.status}`);

const noSig = await fetch(ENDPOINT, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
}).then((x) => x.status);
check('missing signature rejected', noSig === 401, `${noSig}`);

console.log('\n--- applying a valid payment.paid ---');
const eventId = `evt_paid_${Date.now()}`;
r = await send(evt(eventId, 'payment.paid', paid));
check('accepted', r.status === 200, JSON.stringify(r.body));

const { data: after } = await db.from('orders')
  .select('status, payment_status').eq('id', order.id).single();
check('order marked paid', after.payment_status === 'paid', after.payment_status);
check('kiosk order auto-confirmed to kitchen', after.status === 'confirmed', after.status);

const { data: payRow } = await db.from('payments')
  .select('status, payment_id').eq('intent_id', intentId).single();
check('payment row settled', payRow.status === 'paid' && payRow.payment_id === paid.id);

console.log('\n--- idempotency (PayMongo retries deliveries) ---');
r = await send(evt(eventId, 'payment.paid', paid));
check('duplicate event skipped', r.status === 200 && r.body?.duplicate === true, JSON.stringify(r.body));

const { count } = await db.from('webhook_events')
  .select('*', { count: 'exact', head: true }).eq('event_id', eventId);
check('stored exactly once', count === 1, `count=${count}`);

console.log('\n--- payment.failed ---');
const { data: o2 } = await db.from('orders').insert({
  channel: 'online', fulfillment_type: 'pickup', customer_name: 'Fail Test',
  status: 'pending', payment_status: 'processing', payment_method: 'gcash',
  total_amount: product.price,
}).select().single();

const intent2 = `pi_fail_${Date.now()}`;
await db.from('payments').insert({
  order_id: o2.id, provider: 'paymongo', intent_id: intent2,
  amount_centavos: 10000, status: 'processing',
});

await send(evt(`evt_failed_${Date.now()}`, 'payment.failed', {
  id: `pay_f_${Date.now()}`,
  attributes: { payment_intent_id: intent2, metadata: { order_id: o2.id } },
}));

const { data: o2after } = await db.from('orders')
  .select('status, payment_status').eq('id', o2.id).single();
check('failed payment recorded', o2after.payment_status === 'failed', o2after.payment_status);
check('order NOT confirmed on failure', o2after.status === 'pending', o2after.status);

await db.from('orders').delete().in('id', [order.id, o2.id]);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
