// End-to-end walk through both business flows, against the running API.
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

const BASE = 'http://localhost:4000/api/v1';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD;
const CASHIER_PASSWORD = process.env.TEST_CASHIER_PASSWORD ?? process.env.CASHIER_PASSWORD;
let pass = 0, fail = 0;

const call = async (method, path, { body, token, kioskKey } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(kioskKey ? { 'X-Kiosk-Key': kioskKey } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? '  ' + detail : ''}`);
  ok ? pass++ : fail++;
};

const login = async (email, password) =>
  (await call('POST', '/auth/login', { body: { email, password } })).body.session.access_token;

const admin = await login('admin@3k.local', ADMIN_PASSWORD);
const cashier = await login('cashier@3k.local', CASHIER_PASSWORD);
const rider = await login('rider1@3k.local', 'testpass12345');
const customer = await login('customer@3k.local', 'testpass12345');

const menu = (await call('GET', '/menu')).body.data.flatMap((c) => c.products);
const tapsilog = menu.find((p) => p.name === 'Tapsilog');       // 100
const sisig = menu.find((p) => p.name === 'Sizzling Sisig');    // 130

console.log('\n=== ADMIN: provision a kiosk device ===');
let r = await call('POST', '/admin/kiosks', { body: { name: 'Lobby Kiosk 1' }, token: admin });
const kioskKey = r.body?.data?.key;
check('issue device key', r.status === 201 && !!kioskKey, r.body?.data?.key_prefix + '…');
check('raw key returned once', typeof kioskKey === 'string' && kioskKey.startsWith('kiosk_'));

r = await call('GET', '/admin/kiosks', { token: admin });
check('key_hash never exposed in list', !JSON.stringify(r.body).includes('key_hash'));

console.log('\n=== KIOSK AUTH ===');
r = await call('POST', '/kiosk/orders', { body: {}, kioskKey: 'kiosk_bogus' });
check('bogus device key rejected', r.status === 401, `${r.status}`);
r = await call('POST', '/kiosk/orders', { body: {} });
check('missing device key rejected', r.status === 401, `${r.status}`);

console.log('\n=== KIOSK: place a dine-in cash order (2x100 + 1x130 = 330) ===');
r = await call('POST', '/kiosk/orders', {
  kioskKey,
  body: {
    fulfillment_type: 'dine_in', customer_name: 'Ana Reyes', payment_method: 'cash',
    items: [{ product_id: tapsilog.id, quantity: 2 }, { product_id: sisig.id, quantity: 1 }],
  },
});
const kioskOrder = r.body?.data?.order;
check('order created', r.status === 201, kioskOrder?.order_number);
check('channel/fulfillment', kioskOrder?.channel === 'kiosk' && kioskOrder?.fulfillment_type === 'dine_in');
check('total = 330', Number(kioskOrder?.total_amount) === 330, `got ${kioskOrder?.total_amount}`);
check('starts pending/unpaid', kioskOrder?.status === 'pending' && kioskOrder?.payment_status === 'unpaid');
check('tagged to the device', kioskOrder?.kiosk_device_id != null);

r = await call('POST', '/kiosk/orders', {
  kioskKey,
  body: { fulfillment_type: 'delivery', customer_name: 'X', payment_method: 'cash',
          items: [{ product_id: tapsilog.id, quantity: 1 }] },
});
check('kiosk cannot create a delivery', r.status === 400, `${r.status}`);

console.log('\n=== POS: find it by the name the customer gave ===');
r = await call('GET', '/pos/orders?q=Ana', { token: cashier });
check('found by customer name', r.body?.data?.some((o) => o.id === kioskOrder.id), `${r.body?.meta?.total} match(es)`);
r = await call('GET', `/pos/orders?q=${kioskOrder.order_number}`, { token: cashier });
check('found by order number', r.body?.data?.some((o) => o.id === kioskOrder.id));

console.log('\n=== POS: modify, confirm, cook, settle ===');
r = await call('PATCH', `/pos/orders/${kioskOrder.id}/items`, {
  token: cashier,
  body: { items: [{ product_id: tapsilog.id, quantity: 1 }] },
});
check('modify items recomputes total', Number(r.body?.data?.total_amount) === 100, `got ${r.body?.data?.total_amount}`);

r = await call('PATCH', `/pos/orders/${kioskOrder.id}/status`, { token: cashier, body: { status: 'ready' } });
check('illegal transition pending->ready blocked', r.status === 409, r.body?.error?.message?.slice(0, 60));

r = await call('POST', `/pos/orders/${kioskOrder.id}/confirm`, { token: cashier });
check('confirm', r.status === 200 && r.body?.data?.status === 'confirmed');
r = await call('POST', `/pos/orders/${kioskOrder.id}/confirm`, { token: cashier });
check('double-confirm rejected', r.status === 409);

for (const s of ['preparing', 'ready']) {
  r = await call('PATCH', `/pos/orders/${kioskOrder.id}/status`, { token: cashier, body: { status: s } });
  check(`advance -> ${s}`, r.body?.data?.status === s);
}

r = await call('POST', `/pos/orders/${kioskOrder.id}/payment/cash`, { token: cashier, body: { tendered_amount: 50 } });
check('underpayment rejected', r.status === 400);
r = await call('POST', `/pos/orders/${kioskOrder.id}/payment/cash`, { token: cashier, body: { tendered_amount: 200 } });
check('cash settled', r.body?.data?.payment_status === 'paid');
check('change computed', r.body?.meta?.change === 100, `got ${r.body?.meta?.change}`);

r = await call('PATCH', `/pos/orders/${kioskOrder.id}/status`, { token: cashier, body: { status: 'completed' } });
check('completed', r.body?.data?.status === 'completed');

console.log('\n=== RIDER: online delivery, pool + claim race ===');
r = await call('POST', '/orders', {
  token: customer,
  body: {
    fulfillment_type: 'delivery', payment_method: 'cash',
    delivery_address: { line1: '9 Mabini St', city: 'Davao City' },
    items: [{ product_id: sisig.id, quantity: 2 }],
  },
});
const del = r.body?.data;
check('online delivery created', r.status === 201, `${del?.order_number} PHP${del?.total_amount}`);

r = await call('GET', '/rider/pool', { token: rider });
check('not in pool while pending', !r.body?.data?.some((o) => o.id === del.id));

await call('POST', `/pos/orders/${del.id}/confirm`, { token: cashier });
for (const s of ['preparing', 'ready']) {
  await call('PATCH', `/pos/orders/${del.id}/status`, { token: cashier, body: { status: s } });
}
r = await call('GET', '/rider/pool', { token: rider });
check('appears in pool once ready', r.body?.data?.some((o) => o.id === del.id));

// Two simultaneous claims: exactly one must win.
const [a, b] = await Promise.all([
  call('POST', `/rider/orders/${del.id}/claim`, { token: rider }),
  call('POST', `/rider/orders/${del.id}/claim`, { token: rider }),
]);
const codes = [a.status, b.status].sort();
check('claim race: exactly one winner', codes[0] === 200 && codes[1] === 409, `got ${codes.join(' / ')}`);

r = await call('GET', '/rider/pool', { token: rider });
check('leaves pool once claimed', !r.body?.data?.some((o) => o.id === del.id));

r = await call('POST', `/rider/orders/${del.id}/delivered`, { token: rider });
check('COD requires collected_amount', r.status === 400);
r = await call('POST', `/rider/orders/${del.id}/delivered`, { token: rider, body: { collected_amount: 260 } });
check('delivered + COD collected', r.body?.data?.status === 'completed' && r.body?.data?.payment_status === 'paid');

console.log('\n=== AUTHORIZATION BOUNDARIES ===');
r = await call('GET', '/pos/orders', { token: customer });
check('customer blocked from POS', r.status === 403, `${r.status}`);
r = await call('GET', '/rider/pool', { token: cashier });
check('cashier blocked from rider pool', r.status === 403, `${r.status}`);
r = await call('GET', '/admin/kiosks', { token: cashier });
check('cashier blocked from admin', r.status === 403, `${r.status}`);
r = await call('GET', '/pos/orders', { token: rider });
check('rider blocked from POS', r.status === 403, `${r.status}`);

console.log(`\n${fail === 0 ? 'ALL' : ''} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
