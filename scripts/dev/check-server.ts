// @ts-nocheck -- a test script: it pokes at failure results without narrowing them first.
// End-to-end check of the server actions (cashier and kiosk gates, kiosk orders, visitor chat,
// staff screens, password change) and private storage, as the @3k.local test accounts.
//
// It WRITES to the Supabase project in .env.local: a few test orders at GMA Terminal (left voided,
// refunded, cancelled or completed), chat messages, and for check-server a kiosk device it then revokes.
//
//   npm run check:flows


const { supabase } = await import('@/utils/supabase');
const employee = await import('@/controllers/server/employeeActions');
const kiosk = await import('@/controllers/server/kioskActions');
const visitor = await import('@/controllers/server/visitorChatActions');
const staff = await import('@/controllers/server/staffActions');
const account = await import('@/controllers/server/accountActions');
const auth = await import('@/controllers/authController');
const branchCtl = await import('@/controllers/branchController');
const menu = await import('@/controllers/menuController');
const order = await import('@/controllers/orderController');
const pay = await import('@/controllers/paymentController');
const chat = await import('@/controllers/chatController');

let failures = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${JSON.stringify(detail)}`}`);
};
const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? null;
const as = async (email: string, password: string) => {
  await supabase.auth.signOut({ scope: 'local' });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
};

const branches = await branchCtl.getActiveBranches();
const gma = branches.success ? branches.data.find((b) => b.code === 'gma')! : null!;
const m = await menu.getMenu({ branchId: gma.id });
const product = m.success ? m.data.flatMap((c) => c.products).find((p) => p.is_available && p.price != null && p.variants.length === 0)! : null!;

// --- cashier gate --------------------------------------------------------------------------
const bad = await employee.loginCashier({ branch_id: gma.id, password: 'wrong-password' });
check('cashier gate rejects a wrong password (401)', !bad.success && bad.status === 401, bad);
const good = await employee.loginCashier({ branch_id: gma.id, password: 'cashier123' });
check('cashier gate returns a session', good.success && Boolean(good.data.access_token), good.success || good);
if (good.success) {
  const adopted = await auth.adoptSession(good.data);
  const s = await auth.getSession();
  check('browser adopts the cashier session', adopted.success && auth.roleOf(s) === 'cashier', auth.roleOf(s));
}

// --- kiosk -----------------------------------------------------------------------------------
const kbad = await employee.unlockKiosk({ branch_id: gma.id, password: 'nope', device_name: 'Flow test kiosk' });
check('kiosk gate rejects a wrong password', !kbad.success && kbad.status === 401, kbad);
const unlocked = await employee.unlockKiosk({ branch_id: gma.id, password: 'kiosk123', device_name: 'Flow test kiosk' });
check('kiosk unlock issues a device key', unlocked.success && unlocked.data.key.startsWith('kiosk_'), unlocked.success || unlocked);
const key = unlocked.success ? unlocked.data.key : null;
const me = await kiosk.kioskMe(key);
check('kiosk knows its branch', me.success && me.data.branch?.id === gma.id, me);
const ko = await kiosk.createKioskOrder(key, {
  fulfillment_type: 'dine_in',
  customer_name: 'Flow Test Kiosk',
  payment_method: 'cash',
  items: [{ product_id: product.id, quantity: 1 }],
});
check('kiosk places an order', ko.success && ko.data.channel === 'kiosk' && /^K-/.test(ko.data.order_number), ko.success ? ko.data.order_number : ko);
const kfake = await kiosk.kioskMe('kiosk_not-a-real-key');
check('unknown kiosk key is refused (401)', !kfake.success && kfake.status === 401, kfake);

// --- visitor chat -> staff inbox --------------------------------------------------------------
const vt = await visitor.createVisitorThread({ branch_id: gma.id, body: 'Hello from the flow test', name: 'Flow Tester' });
check('visitor opens a conversation', vt.success && Boolean(vt.data.token), vt.success || vt);
const vthread = vt.success ? vt.data.thread_id : '';
const vbad = await visitor.getVisitorMessages(vthread, 'chat_wrong');
check('wrong visitor token is refused (401)', !vbad.success && vbad.status === 401, vbad);

await as('cashier@3k.local', 'cashier123');
const inbox = await chat.listSupportThreads(gma.id);
const mine = inbox.success ? inbox.data.find((t) => t.id === vthread) : null;
check('cashier inbox shows it, unread, labelled', Boolean(mine?.unread) && /Flow Tester \(Guest-\d+\)/.test(mine?.display_name ?? ''), mine);
const reply = await chat.postStaffMessage(vthread, { body: 'Hi! (flow test reply)' });
check('cashier replies', reply.success, reply);
const read = await chat.markSupportThreadRead(vthread);
check('cashier marks it read', read.success, read);
const vmsgs = vt.success ? await visitor.getVisitorMessages(vthread, vt.data.token) : null;
check('visitor sees the reply', Boolean(vmsgs?.success && vmsgs.data.some((x: any) => x.sender_role === 'cashier')), vmsgs);

// --- GCash receipt upload (private storage) ---------------------------------------------------
await as('customer@3k.local', 'testpass12345');
const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(Date.now() + 86_400_000));
let go = await order.placeOnlineOrder({ branch_id: gma.id, fulfillment_type: 'pickup', payment_method: 'gcash', items: [{ product_id: product.id, quantity: 1 }] });
if (!go.success && go.status === 409) {
  go = await order.placeOnlineOrder({ branch_id: gma.id, fulfillment_type: 'pickup', payment_method: 'gcash', items: [{ product_id: product.id, quantity: 1 }], scheduled_for: `${d}T10:00:00+08:00` });
}
const gid = go.success ? go.data.id : '';
// smallest valid PNG
const png = new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')], { type: 'image/png' });
const up = await pay.uploadReceipt(gid, png);
check('customer uploads a receipt to the private bucket', up.success && up.data.startsWith(`${gid}/`), up);
const fake = new Blob([Buffer.from('not an image at all')], { type: 'image/png' });
const upBad = await pay.uploadReceipt(gid, fake);
check('a non-image is refused', !upBad.success && upBad.status === 415, upBad);
if (up.success) {
  const proof = await pay.submitGcashProof(gid, { receipt_path: up.data });
  check('proof with receipt is submitted', proof.success && proof.data.payment_status === 'processing', proof);
  await as('cashier@3k.local', 'cashier123');
  const withPay = await pay.getOrderWithPayment(gid);
  check('cashier gets a signed link to the receipt', withPay.success && /token=/.test(withPay.data.gcash_payment?.receipt_url ?? ''), withPay.success && withPay.data.gcash_payment);
  const rej = await pay.verifyGcash(gid, { approve: false, reason: 'Flow test: not found in GCash' });
  check('cashier rejects with a reason', rej.success && rej.data.payment_status === 'failed', rej);
  await as('customer@3k.local', 'testpass12345');
  const cn = await order.cancelMyOrder(gid);
  check('customer cancels after a rejected payment', cn.success && cn.data.status === 'cancelled', cn);
}

// --- password change -------------------------------------------------------------------------------
const wrongPw = await account.changeMyPassword(await token(), { current_password: 'wrong-one', new_password: 'testpass12345' });
check('wrong current password is a 400, not 401', !wrongPw.success && wrongPw.status === 400, wrongPw);
const samePw = await account.changeMyPassword(await token(), { current_password: 'testpass12345', new_password: 'testpass12345' });
check('password change with the right current password', samePw.success || /same|different/i.test(samePw.error ?? ''), samePw);

// --- admin: sales, riders, kiosks (and revoke the test kiosk) ------------------------------------
await as('admin.gma@3k.local', 'testpass12345');
const sales = await staff.getSalesReport(await token(), {});
check('branch admin loads the sales report', sales.success && 'totals' in (sales.data as any), sales.success || sales);
const riders = await staff.listRiders(await token(), {});
check('branch admin lists riders', riders.success && riders.data.data.some((r: any) => r.email || r.full_name), riders.success ? riders.data.meta : riders);
const otherBranch = branches.success ? branches.data.find((b) => b.code === 'imus')! : null!;
const foreign = await staff.listKiosks(await token(), otherBranch.id);
check("branch admin sees no other branch's kiosks", foreign.success && foreign.data.length === 0, foreign);
const notAdmin = await staff.listAdmins(await token(), {});
check('branch admin cannot list admins (403)', !notAdmin.success && notAdmin.status === 403, notAdmin);
if (unlocked.success) {
  const rv = await staff.revokeKiosk(await token(), unlocked.data.id);
  check('admin revokes the test kiosk', rv.success, rv);
  const after = await kiosk.kioskMe(key);
  check('revoked kiosk key stops working (403)', !after.success && after.status === 403, after);
}

// --- rate limits (the counters live in the database; IP limits need a web request) ---------
{
  const rl = await import('@/controllers/server/rateLimit');
  const rule = { name: 'flow-test', max: 2, windowSeconds: 60, message: 'Slow down' };
  const who = crypto.randomUUID();
  const r1 = await rl.limit(rule, who);
  const r2 = await rl.limit(rule, who);
  const r3 = await rl.limit(rule, who);
  check('rate limit allows up to its maximum', r1.success && r2.success, [r1, r2]);
  check('rate limit refuses past its maximum (429)', !r3.success && r3.status === 429 && r3.error === 'Slow down', r3);
  check('another caller has its own allowance', (await rl.limit(rule, crypto.randomUUID())).success);

  const guesser = crypto.randomUUID();
  const before = await rl.checkFailures(rule, guesser);
  await rl.recordFailure(rule, guesser);
  await rl.recordFailure(rule, guesser);
  const after = await rl.checkFailures(rule, guesser);
  check('gate allows attempts until the wrong guesses run out', before.success && !after.success && after.status === 429, [before, after]);
  check('outside a web request there is no IP to limit', (await rl.clientIp()) === null);

  await supabase.auth.signOut({ scope: 'local' });
  const fromBrowser = await supabase.rpc('rate_limit_hit', { p_key: 'x', p_window_seconds: 60 });
  check('browsers cannot touch the counters', Boolean(fromBrowser.error), fromBrowser);
  const peek = await supabase.from('rate_limits').select('key').limit(1);
  check('browsers cannot read the counters', Boolean(peek.error) || (peek.data ?? []).length === 0, peek);
}

await supabase.auth.signOut({ scope: 'local' });
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');

export {};
