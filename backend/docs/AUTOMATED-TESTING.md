# Automated Testing

296 tests on Node's built-in runner (`node:test` + `node:assert`) — no Jest,
Mocha, or Supertest. Node 20+ ships everything needed.

For driving the API by hand, see **[TESTING.md](./TESTING.md)**.

```bash
npm test                 # everything
npm run test:unit        # pure logic, no server needed   (80 tests, ~1s)
npm run test:integration # one endpoint at a time        (170 tests, ~90s)
npm run test:e2e         # multi-step journeys            (46 tests, ~40s)
npm run test:coverage    # everything, with coverage
```

---

## Prerequisites

The suite runs against **real Supabase**, not mocks, so it needs the same
`.env` the app uses plus the seeded test accounts. Seed them once:

```bash
node --env-file=.env scripts/seed-accounts.mjs       # admin + cashier
node --env-file=.env scripts/dev/seed-test-users.mjs # customers + rider
```

`seed-accounts.mjs` writes the admin and cashier passwords into `.env` as
`TEST_ADMIN_PASSWORD` and `TEST_CASHIER_PASSWORD`. After that, plain
`npm test` just works — nothing to export.

Both scripts are safe to re-run. `seed-accounts.mjs` **keeps** passwords already
in `.env` rather than rotating them, and re-applies them to the accounts, so
the account and `.env` can never drift apart. Re-seeding is therefore the fix
for any login failure.

If something is wrong, the runner stops **before** running any tests and says
exactly what, instead of reporting hundreds of cancelled tests:

```
Cannot run the test suite.

These test accounts could not sign in:
  cashier (cashier@3k.local): 401

Either the account does not exist yet, or the password in .env is stale.
Re-seed to fix both:
  node --env-file=.env scripts/seed-accounts.mjs
  node --env-file=.env scripts/dev/seed-test-users.mjs
```

> **The suite writes to your real database.** It cleans up after itself — a
> full run leaves zero orders, payments, kiosk devices and webhook events
> behind, with the menu untouched — but do not point it at production. An
> interrupted run (Ctrl-C, or a broken pipe from `npm test | head`) skips the
> `after()` hooks and can leave rows behind.

---

## How a run works

`scripts/run-tests.mjs` wraps the whole thing:

1. Loads `.env` — values already set in your shell win, so CI can override.
2. Boots an API server on port **4100** (not 4000, so it never collides with
   the dev server you have running) with `NODE_ENV=test`, a known
   `PAYMONGO_WEBHOOK_SECRET`, and the rate limiter effectively disabled.
3. Waits for `/health` to answer — up to 30s, since a cold Supabase project
   takes a while to wake.
4. **Preflight:** confirms every test account has a password and can actually
   sign in. Stops here with one clear message if not.
5. Runs `node --test` with `--test-concurrency=1`.
6. Tears the server down and exits with the runner's status.

Two details worth knowing:

- **The server is started outside the runner on purpose.** Node gives each test
  *file* its own process, so a server started inside a test module would not be
  shared — you would get one server per file.
- **Concurrency is pinned to 1.** The tests share one database; running files in
  parallel makes "count the orders in the queue" assertions race each other.

Point the suite at a server you started yourself with `TEST_BASE_URL`:

```bash
TEST_BASE_URL=http://localhost:4000/api/v1 npm test
```

---

## Layout

```
tests/
  helpers/
    client.js     fetch wrapper — always resolves, never throws on 4xx/5xx
    auth.js       logs each role in once per process, caches the token
    db.js         direct Supabase access for arranging and asserting state
    fixtures.js   menu lookups, order builders, and cleanup tracking
  unit/           pure logic — no server, no network
  integration/    one endpoint at a time, positive and negative
  e2e/            multi-step journeys across several actors
```

### Unit — 80 tests

No server, no database. Fast enough to run on every save.

| File | Covers |
| --- | --- |
| `pagination.test.js` | Page maths, off-by-ones, the zero/empty cases |
| `apiError.test.js` | Status mapping, including PostgREST codes → HTTP |
| `validators.test.js` | Every zod schema, including what it must *reject* |
| `money.test.js` | Centavo arithmetic and float-drift resistance |
| `kioskKey.test.js` | Key generation entropy, hashing, non-reversibility |
| `webhookSignature.test.js` | HMAC verification, replay window, tampering |

### Integration — 170 tests

One endpoint at a time, against a live server and database. Each file covers
the happy path *and* the ways the endpoint should refuse.

| File | Covers |
| --- | --- |
| `health.test.js` | Liveness, readiness, unknown-route handling |
| `auth.test.js` | Login, refresh, bad credentials, malformed tokens, role claims |
| `menu.test.js` | Nesting, sort order, availability filtering, product paging |
| `kiosk.test.js` | Device-key auth, revocation, order creation, cross-device isolation |
| `pos.test.js` | Queue search, item edits, transitions, cash settlement, voids |
| `orders.test.js` | Customer orders, address rules, cancel rules, cross-customer isolation |
| `rider.test.js` | Pool contents, claiming, COD collection, delivery completion |
| `admin.test.js` | Kiosk keys, rider accounts, order oversight, role changes |
| `webhooks.test.js` | Signature enforcement, idempotency, paid/failed handling |

### End-to-end — 46 tests

Whole journeys. Each `it()` is one step, so a failure names the step that
broke rather than just "the flow failed".

| File | Journey |
| --- | --- |
| `kiosk-cash-dinein.test.js` | Kiosk order → POS queue → edit → confirm → cook → cash + change → completed → void refused |
| `kiosk-gcash-webhook.test.js` | Kiosk GCash → processing → webhook confirms → **auto-confirmed to the kitchen** → cooked → completed |
| `online-delivery-cod.test.js` | Customer order → POS confirm → ready → rider pool → claim → collect cash → completed, seen from all three sides |
| `void-and-refund.test.js` | Voids: unpaid, cash-paid, and a GCash-paid order that must **not** be voided when the refund cannot be issued |
| `isolation-and-concurrency.test.js` | Who can see what, plus races: concurrent order numbers, contested claims, double payment |

---

## What is deliberately covered

**Negative cases get as much weight as positive ones.** Roughly half the suite
asserts refusals:

- **Validation** — empty carts, fractional quantities, bad UUIDs, missing
  delivery addresses, unknown enum values, oversized page limits.
- **Authorization** — every role against every other role's routes, plus
  unauthenticated access. A customer fetching another customer's order gets
  `404`, not `403`, and there is a test asserting exactly that: `403` would
  confirm the order exists.
- **State machine** — skipping a stage, moving backwards, double-confirming,
  editing an order already in the kitchen, voiding a completed order.
- **Money** — underpayment, double payment, collecting less than owed on
  delivery, and that a client-supplied `total_amount` is ignored.
- **Concurrency** — two riders claiming one order, twelve orders created at
  once, two simultaneous cash settlements.
- **Webhooks** — wrong secret, tampered body, stale timestamp, replayed event.

**Tests that skip themselves** when a precondition is absent, rather than
failing misleadingly: GCash tests call `t.skip()` if PayMongo *is* configured
(and vice versa), and the unpriced-item test skips if the menu has no such
item.

---

## Test data

Everything runs against the real database, so cleanup is explicit rather than
hoped for:

```js
import { track, cleanup } from '../helpers/fixtures.js';

const order = await placeWalkInOrder();  // tracked automatically
track(someOtherOrderId);                 // track anything you create yourself

after(cleanup);                          // deletes them; order_items cascade
```

Kiosk devices use `cleanupKiosks()`. Webhook events are removed by prefix
(`evt_test_%`). Tests that flip a product to unavailable restore it in a
`finally`, and `menu.test.js` has a belt-and-braces `after()` that re-enables
anything left hidden.

Test users (`customer2@3k.local`, `rider1@3k.local`) are **not** deleted —
they are fixtures, created once by the seed script.

---

## Writing a new test

```js
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { get, post } from '../helpers/client.js';
import { tokenFor } from '../helpers/auth.js';
import { cleanup, placeWalkInOrder } from '../helpers/fixtures.js';

describe('POST /pos/orders/:id/something', () => {
  let cashier;

  before(async () => {
    cashier = await tokenFor('cashier');
  });

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

- `request()` **never throws** on a non-2xx — assert on `res.status`.
- Name the behaviour, not the mechanism: *"refuses once the kitchen has
  started"* beats *"returns 409"*.
- Use `setOrderState()` to arrange a precondition instead of walking the whole
  state machine; that keeps the test about one thing.
- Every test that creates an order must `track()` it, or use a fixture builder
  that does.

Run one file while iterating:

```bash
node --env-file=.env --test tests/integration/pos.test.js   # server must be up
```

---

## What this suite has already caught

Worth recording, because it is the argument for keeping it:

**1. Unstable pagination.** `GET /products` ordered only by `sort_order`, which
is assigned *per category* — eight products share `sort_order: 1`. Postgres may
return tied rows in any order between queries, so page 1 and page 2 overlapped
and some products never appeared on any page at all. Invisible by hand; the
test "returns different rows on a later page" failed immediately. Fixed by
adding `id` as a tiebreaker to every paginated query, which makes the ordering
total. A full sweep now returns all 66 products exactly once.

**2. Orphaned orders when GCash initiation failed.** `POST /kiosk/orders`
created the order and *then* called PayMongo. If that call failed the order was
already committed, so the customer got a `503` and never learned the order id —
while a `pending` order nobody could pay for sat in the cashier's queue
forever. Found not by an assertion but by noticing the suite left rows behind:
one stranded order per run, all from the same test. The controller now rolls
the order back, and a regression test asserts no order survives a failed
payment start.

That second one is the better argument for the suite: the bug was invisible in
every response the API returned, and only showed up as residue.

---

## Continuous integration

`npm test` exits non-zero on failure, so it drops in unchanged:

```yaml
- uses: actions/setup-node@v4
  with: { node-version: '22' }
- run: npm ci
- run: npm test
  env:
    SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    SUPABASE_PUBLISHABLE_KEY: ${{ secrets.SUPABASE_PUBLISHABLE_KEY }}
    SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}
    TEST_ADMIN_PASSWORD: ${{ secrets.TEST_ADMIN_PASSWORD }}
    TEST_CASHIER_PASSWORD: ${{ secrets.TEST_CASHIER_PASSWORD }}
```

Use a **separate Supabase project** for CI. The suite cleans up after itself,
but it writes real rows, and a failed run can leave some behind.

---

## Known limits

- **No mocking.** Tests hit real Supabase, so they are slower (~3 min) and need
  network. The trade is that they exercise RLS, triggers, and constraints —
  precisely the parts most likely to break.
- **PayMongo's outbound calls are untested.** Creating payment intents needs
  live credentials. Everything from the webhook inwards *is* tested, by signing
  payloads with the server's own secret. GCash tests skip themselves rather
  than fail when unconfigured.
- **Realtime is tested indirectly.** `check-rls.mjs` asserts that each role sees
  exactly its permitted rows; since Realtime delivers precisely what a select
  would return for that user, correct RLS means correct subscriptions. There is
  no test that opens a websocket.
- **Cold starts.** The first run after a Supabase project has been idle can take
  20s to get healthy. The runner allows for it; a timeout usually means the
  project is paused, not that the code is broken.
