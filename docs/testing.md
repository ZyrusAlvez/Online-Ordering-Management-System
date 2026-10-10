# Automated testing

**525 tests** on Node's built-in runner (`node:test` + `node:assert`): no Jest, Mocha or Supertest. Node 20+ ships
everything needed. For poking at the API by hand, see [testing-manual.md](./testing-manual.md); for logins to try the
app yourself, [test-accounts.md](./test-accounts.md).

```bash
cd backend
npm test                  # everything                          (525 tests, about 8 minutes)
npm run test:unit         # pure logic, no server needed        (125 tests, about 1 s)
npm run test:integration  # one endpoint at a time              (354 tests, about 7 minutes)
npm run test:e2e          # multi-step journeys                 (46 tests, about 40 s)
npm run test:coverage     # everything, with coverage
node --env-file=.env scripts/dev/check-rls.mjs   # what each role is allowed to see (see below)
```

---

## Prerequisites

The suite runs against the **real Supabase project**, not mocks, so it needs the same `.env` the app uses plus the
seeded accounts:

```bash
node --env-file=.env scripts/seed-accounts.mjs        # super admin, GMA cashier and GMA kiosk passwords
node --env-file=.env scripts/dev/seed-test-users.mjs  # customers, a GMA rider, and the Imus admin, cashier and rider
```

`seed-accounts.mjs` writes the passwords into `.env` (`TEST_ADMIN_PASSWORD`, `TEST_CASHIER_PASSWORD`,
`TEST_KIOSK_PASSWORD`), so afterwards plain `npm test` just works. Both scripts are safe to re-run, and re-seeding is the
fix for any login failure: it re-applies the password in `.env` so the account and the file cannot disagree.

If something is wrong the runner stops **before** running anything and says exactly what:

```
Cannot run the test suite.

These test accounts could not sign in:
  cashier (cashier@3k.local): 401

Either the account does not exist yet, or the password in .env is stale.
```

> **The suite writes to your database.** It cleans up after itself (orders, payments, kiosk devices, chat threads,
> uploaded photos, test users it created), with the menu untouched, but **never point it at production**. An
> interrupted run (Ctrl-C) skips the clean-up hooks and can leave rows behind.

---

## How a run works

`scripts/run-tests.mjs` wraps it all:

1. Loads `.env`; values already in your shell win, so CI can override.
2. Starts an API on port **4100** (so it never collides with your dev server on 4000) with `NODE_ENV=test`, a known
   webhook secret and the rate limiter effectively off.
3. Waits for `/health` (up to 30 s; a cold Supabase project takes a while to wake).
4. **Preflight:** every test account must sign in, or it stops with one clear message.
5. Runs `node --test --test-concurrency=1`.
6. Stops the server and exits with the runner's status.

Two details that matter:

- **The server starts outside the runner on purpose.** Node gives each test *file* its own process, so a server started
  in a test module would not be shared.
- **Concurrency is pinned to 1.** The tests share one database; parallel files would race on assertions like "count the
  orders in the queue".

To test a server you started yourself: `TEST_BASE_URL=http://localhost:4000/api/v1 npm test`.

---

## Layout

```
backend/tests/
  helpers/
    client.js     fetch wrapper: always resolves, never throws on 4xx/5xx
    auth.js       logs each role in once per process, caches the token
    db.js         direct database access (secret key) for arranging and checking state
    fixtures.js   menu lookups, order builders, cleanup tracking
  unit/           pure logic: no server, no network
  integration/    one endpoint or one concern at a time, positive and negative
  e2e/            multi-step journeys across several actors
```

### Unit (125)

| File | Covers |
| --- | --- |
| `fields.test.js` | The shared field rules: 11-digit phone, trimmed text, money (2 decimals, ceiling), quantity, email, password, image links, map-pin bounds |
| `validators.test.js` | Every request schema, including what it must *reject* |
| `manilaDate.test.js` | Manila "today", real-date checks, day arithmetic, range limits (the sales report's dates) |
| `pagination.test.js` | Page maths, off-by-ones, empty cases |
| `apiError.test.js` | Status mapping, including database error codes → HTTP |
| `money.test.js` | Centavo arithmetic, float-drift resistance |
| `kioskKey.test.js` | Key entropy, hashing, non-reversibility |
| `password.test.js` | Salted hashing and verification of the kiosk password |
| `webhookSignature.test.js` | Signature check, replay window, tampering |
| `branchScope.test.js` | Who may see which branch: super admin, one branch, none; which branch an action happens at |
| `schedule.test.js` | Manila opening hours, ASAP only while open, 15-minute slots, 30-minute lead, two days ahead, next open slot (with a fixed clock) |

### Integration (354)

| File | Covers |
| --- | --- |
| `health.test.js` | Liveness, readiness, unknown routes |
| `auth.test.js` | Login, refresh, bad credentials, role in the token, **a user-edited `user_metadata` never grants a role** |
| `menu.test.js` | Nesting, sort order, availability filtering, paging |
| `images.test.js` | Product photo upload/replace/remove, site images, byte checks, access |
| `kiosk.test.js` | Device key auth, revocation, order creation, cross-device isolation |
| `pos.test.js` | Queue search, edits, transitions, cash, voids |
| `orders.test.js` | Customer orders, address rules, cancel rules, cross-customer isolation |
| `rider.test.js` | Pool, claiming, cash on delivery, completion |
| `admin.test.js` | Kiosk keys, rider accounts, order oversight, roles |
| `employee.test.js` | Cashier and kiosk passwords, changing them, the gate rate limits |
| `profile.test.js` | Profile and password changes; role and active status are not editable; direct table edits refused |
| `chat.test.js` | Guest chat (token, inbox, replies, live ping), delivery chat windows and access, rate limit, guest numbers |
| `chat-images.test.js` | Photos in all four conversations: privacy, size, fake files, the 30-photo cap, closed chats |
| `sales.test.js` | The sales report with exact figures (see below) |
| `hardening.test.js` | The bug sweep: no direct order writes, order numbers per day and per branch, search escaping, double cash payment, product/option edits after ordering, deactivated riders, phone and field rules, database limits |
| `payments-fake.test.js` | GCash retries, refunds, voids and late payments against a **fake PayMongo server** (see below) |
| `webhooks.test.js` | Signature enforcement, idempotency, paid/failed handling |
| `branch-scope.test.js` | Branch isolation: the Imus admin, cashier and rider against GMA Terminal (orders, sales, riders, kiosks, refunds, walk-ins, the rider pool, chat inbox, row-level security); admin accounts; super-admin-only pages |
| `branches.test.js` | Adding and editing branches, hours, deactivating, validation, super admin only |
| `branch-availability.test.js` | Sold out at one branch: hidden from that branch's menu, refused in its orders, other branches unaffected, branch admins only |
| `scheduling.test.js` | Scheduled online orders against two throwaway branches (always open, and one closed now): ASAP refused while closed, valid and invalid slots, online orders only |

### End-to-end (46)

Whole journeys; each `it()` is one step, so a failure names the step that broke.

| File | Journey |
| --- | --- |
| `kiosk-cash-dinein.test.js` | Kiosk order → POS queue → edit → confirm → cook → cash and change → completed → void refused |
| `kiosk-gcash-webhook.test.js` | Kiosk GCash → processing → webhook confirms → auto-confirmed to the kitchen → completed |
| `online-delivery-cod.test.js` | Customer order → confirm → ready → rider pool → claim → collect cash → completed, seen from all three sides |
| `void-and-refund.test.js` | Voids: unpaid, cash-paid, and a GCash-paid order that must **not** be voided when the refund cannot be issued |
| `isolation-and-concurrency.test.js` | Who can see what, plus races: concurrent order numbers, contested claims, double payment |

### Row-level security check

`scripts/dev/check-rls.mjs` signs in as each role and asks the database directly what it can read: customers see only
their own orders and chats, cashiers and admins see their branches' orders and chats (the Imus cashier and admin see
none of GMA Terminal's), the super admin sees everything, riders see their branch's ready pool plus their own deliveries,
anonymous sees nothing, and (for chat) a rider loses a delivery chat when the order is released. API routes use the
secret key and bypass these policies, so the API tests say nothing about them; this script is the only check. Since the
live feed delivers exactly what a read would return, correct policies mean correct subscriptions.

---

## Techniques worth knowing

**Backdated sales data.** The database also holds real orders, so the sales tests put every figure on a day in 2001 where
nothing else exists: orders are inserted in exactly the state under test (counter cash still pending, kiosk GCash confirmed,
voided, refunded, cancelled, unpaid, and so on) and the report is asked for that one day. It checks what counts, what
must not, the Manila midnight boundary (a second either side), zero-filled quiet days and access control.

**A fake PayMongo.** PayMongo is not configured in the test environment, so `payments-fake.test.js` starts a small HTTP
server that records every call it receives, points the payment service at it, then exercises retries, cancellations,
refunds, failed refunds, late payments on voided orders and cash-versus-GCash races, asserting both the database and the
exact calls made.

**Direct database writes with the public key.** Tests sign in as a customer and try to insert or update orders and
profiles through the database interface to prove those writes are refused.

**Live checks.** The chat test subscribes to the guest's broadcast channel and asserts a ping arrives with no content.
Browser flows (map, session, chat, cart, dashboard) were additionally checked by driving a real headless Chrome; those
scripts are not part of the repository.

---

## What is deliberately covered

**Negative cases get as much weight as positive ones.**

- **Validation:** empty carts, fractional or oversized quantities, bad ids, phone numbers of every wrong shape, blank
  names, impossible dates, coordinates outside the Philippines, bad image bytes, oversized uploads.
- **Authorization:** every role against every other role's routes, plus unauthenticated access. A customer fetching
  another customer's order gets **404, not 403** (a 403 would confirm it exists), and there is a test for exactly that.
- **State machine:** skipping a stage, going backwards, double-confirming, editing a started order, voiding a completed one.
- **Money:** underpayment, double payment, short cash on delivery, a client-supplied total being ignored.
- **Concurrency:** two riders claiming one order, twelve orders created at once, simultaneous cash payments.
- **Webhooks:** wrong secret, tampered body, stale timestamp, replayed event, a failure that must be retried.

Tests that cannot run in the current environment **skip themselves** rather than failing misleadingly (for example the
"GCash unavailable" tests skip if PayMongo *is* configured).

---

## Test data

```js
import { track, cleanup } from '../helpers/fixtures.js';

const order = await placeWalkInOrder();  // tracked automatically
track(someOtherOrderId);                 // track anything you create yourself

after(cleanup);                          // deletes them; items, payments and delivery chats cascade
```

- Kiosk devices: `cleanupKiosks()`. Webhook events: removed by prefix (`evt_test_%`).
- **Files are not deleted by the database.** Any test that stores a chat photo removes the files itself in `after()`
  (see `chat-images.test.js`); a leftover file in `chat-images` is a test leak.
- Tests that flip a product to unavailable restore it in a `finally`.
- Sample users (`customer@3k.local`, `customer2@3k.local`, `rider1@3k.local`, and the Imus `admin.imus@`,
  `cashier.imus@` and `rider.imus@`) are **fixtures**: created once by the seed script, never deleted. A test that
  needs a throwaway user creates it and deletes it; so do branches (`branches.test.js`, `scheduling.test.js`).
- **Branches and opening hours.** Test orders go to GMA Terminal (`branchId()` in `fixtures.js`). Online orders are
  refused "as soon as possible" while a branch is closed, so `orderTime()` adds the next open slot when GMA is closed:
  the suite gives the same results at any hour. Spread it into any online order body a test builds by hand.
- **Rate limits:** a few limits count per server run (for example five guest chats per hour). A test that needs a guest
  conversation without using that budget creates one directly in the database, as `chat-images.test.js` does.

---

## Writing a new test

```js
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { post } from '../helpers/client.js';
import { tokenFor } from '../helpers/auth.js';
import { setOrderState } from '../helpers/db.js';
import { cleanup, placeWalkInOrder } from '../helpers/fixtures.js';

describe('POST /pos/orders/:id/something', () => {
  let cashier;
  before(async () => { cashier = await tokenFor('cashier'); });
  after(cleanup);

  it('does the thing', async () => {
    const order = await placeWalkInOrder();
    const res = await post(`/pos/orders/${order.id}/something`, { x: 1 }, { token: cashier });
    assert.equal(res.status, 200);
  });

  it('refuses when the order is already done', async () => {
    const order = await placeWalkInOrder();
    await setOrderState(order.id, { status: 'completed' });
    const res = await post(`/pos/orders/${order.id}/something`, { x: 1 }, { token: cashier });
    assert.equal(res.status, 409);
  });
});
```

Conventions worth keeping:

- `request()` **never throws** on a non-2xx; assert on `res.status`.
- Name the behaviour, not the mechanism: *"refuses once the kitchen has started"* beats *"returns 409"*.
- Use `setOrderState()` to arrange a precondition instead of walking the whole state machine.
- Every test that creates an order must `track()` it, or use a fixture that does.
- When you add a rule, add the test that **fails without it**, and a negative test beside the positive one.

Run one file while iterating (the server must be up):

```bash
node --env-file=.env --test tests/integration/pos.test.js
```

---

## What the suite has caught

It earns its keep. Three examples:

1. **Unstable pagination.** `GET /products` ordered only by a per-category `sort_order`, so tied rows came back in any
   order and pages overlapped; some products appeared on no page. Fixed with `id` as a tiebreaker.
2. **Orphaned orders when GCash failed to start.** The order was created before calling PayMongo, so a failure left an
   unpayable pending order in the queue. Found by noticing the suite left rows behind. The order is now rolled back.
3. **A privilege escalation.** A regression test now asserts that editing your own `user_metadata` does not grant a role
   ([security.md](./security.md#issues-found-and-fixed)).

---

## Continuous integration

`npm test` exits non-zero on failure, so it drops in unchanged:

```yaml
- uses: actions/setup-node@v4
  with: { node-version: '22' }
- run: npm ci
  working-directory: backend
- run: npm test
  working-directory: backend
  env:
    SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    SUPABASE_PUBLISHABLE_KEY: ${{ secrets.SUPABASE_PUBLISHABLE_KEY }}
    SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}
    TEST_ADMIN_PASSWORD: ${{ secrets.TEST_ADMIN_PASSWORD }}
    TEST_CASHIER_PASSWORD: ${{ secrets.TEST_CASHIER_PASSWORD }}
    TEST_KIOSK_PASSWORD: ${{ secrets.TEST_KIOSK_PASSWORD }}
```

Use a **separate Supabase project** for CI (with all migrations applied and the accounts seeded); the suite writes real rows.

---

## Known limits

- **No mocking** (except the fake PayMongo). Tests hit real Supabase, so they are slower and need the network. The
  trade is that they exercise row-level security, triggers and constraints, the parts most likely to break.
- **Real PayMongo is untested.** Everything from the notification inwards, and the outbound calls against the fake, are
  covered; nothing has run against PayMongo's own servers.
- **Frontend has no automated tests in the repository.** The backend is covered thoroughly; screens were checked by
  hand and with ad-hoc browser scripts. A saved browser suite (for example Playwright) is the natural next step.
- **Cold starts.** The first run after a Supabase project has been idle can take 20 s to get healthy. A timeout usually
  means the project is paused, not that the code is broken.
