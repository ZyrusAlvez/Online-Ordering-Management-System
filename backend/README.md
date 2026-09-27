# Online Ordering Management System — Backend

Node/Express REST API backed by Supabase (Postgres + Auth).

## Stack

- Express 4 (ESM)
- Supabase JS client (`@supabase/supabase-js`)
- zod for request validation
- helmet, cors, express-rate-limit, morgan, compression

## Getting started

```bash
npm install
cp .env.example .env   # then fill in your Supabase project's values
npm run dev             # http://localhost:4000/api/v1
```

`npm run dev` uses Node's built-in `--watch` and `--env-file` flags (Node ≥20), so no nodemon/dotenv-cli is needed. `npm start` runs the same entry point without file watching, loading env vars via the `dotenv` import in `src/config/env.js`.

## Environment variables

See [.env.example](.env.example) for the full, commented list. At minimum you must set, from your Supabase dashboard under **Project Settings → API**:

| Variable | Where to find it |
| --- | --- |
| `SUPABASE_URL` | Project Settings → API → Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Project Settings → API → `publishable` key (`sb_publishable_...`) |
| `SUPABASE_SECRET_KEY` | Project Settings → API → `secret` key (`sb_secret_...`, **server-only, never expose**) |

`SUPABASE_JWKS_URL` and `DATABASE_URL` are optional (see [.env.example](.env.example)).

GCash payments additionally need `PAYMONGO_SECRET_KEY` and `PAYMONGO_WEBHOOK_SECRET`. They are **optional**: without them the server boots normally and the whole cash business works — only the GCash endpoints return `503`.

The app validates `.env` on boot with zod (`src/config/env.js`) and exits with a clear error if anything required is missing.

## Documentation

- **[docs/API.md](docs/API.md)** — full endpoint reference for frontend developers, with real request/response payloads and the Realtime setup.
- **[docs/AUTOMATED-TESTING.md](docs/AUTOMATED-TESTING.md)** — the 296-test suite: how to run it, what it covers, how to add to it.
- **[docs/TESTING.md](docs/TESTING.md)** — manual `curl` walkthrough for exploring or debugging a specific endpoint.

## Project structure

Layered, so each file does one job:

```
request → routes → middleware → controller → service → Supabase
```

```
src/
  config/       env loading/validation, Supabase clients
  constants/    shared domain vocabulary (statuses, transitions, roles)
  validators/   zod schemas, one module per domain
  middleware/   auth (JWT + roles), kiosk device keys, validation, errors
  controllers/  request/response handling — read input, call a service, respond
  services/     business logic and data access (the model layer)
  routes/       routing only: path, middleware chain, controller
  utils/        ApiError, asyncHandler, pagination
  app.js        middleware pipeline
  server.js     entry point
supabase/
  migrations/   schema, applied in filename order
  seed-data/    menu.json — the source of truth for the menu
  seed.sql      generated from menu.json by generate-seed.mjs
scripts/
  seed-accounts.mjs   creates the admin + shared cashier logins
  dev/                verification scripts (RLS, webhooks, end-to-end)
```

**Where does my change go?**

| Changing… | Edit |
| --- | --- |
| The URL, method, or who may call it | `routes/` |
| What the request must contain | `validators/` |
| The HTTP response shape | `controllers/` |
| A business rule, or anything touching the database | `services/` |
| A status name or allowed transition | `constants/orders.js` |

Routes never contain queries, and services never touch `req`/`res` — that
separation is what keeps the route files readable as a table of contents.

## The five interfaces

Routes are namespaced per frontend, so each app has one place to read:

| Interface | Base path | Authentication |
| --- | --- | --- |
| Kiosk | `/kiosk/*` | `X-Kiosk-Key` device header |
| POS (cashier) | `/pos/*` | Bearer token, role `cashier` or `admin` |
| Online customer | `/orders/*` | Bearer token, any signed-in user |
| Rider | `/rider/*` | Bearer token, role `rider` |
| Admin | `/admin/*` | Bearer token, role `admin` |

Shared, unauthenticated: `/menu`, `/categories`, `/products`, `/health`.

The alternative — one `/orders` that behaves differently per caller — was rejected deliberately: it makes the contract impossible to document and test per app.

## Roles

| Role | Created by | Notes |
| --- | --- | --- |
| `customer` | self-registration (`POST /auth/register`) | forced; registration can never mint staff |
| `cashier` | admin | **one shared POS login** |
| `rider` | admin (`POST /admin/riders`) | |
| `admin` | seeded once | |

A role lives in two places that must agree: `app_metadata.role` (carried in the JWT, read by `requireRole` and the `auth_role()` RLS helper) and `profiles.role` (queryable, so admin screens can list riders). Always change it through `services/profiles.js`, never directly.

Seed the two staff accounts with:

```bash
node --env-file=.env scripts/seed-accounts.mjs
```

## Order lifecycle

```
pending ─confirm─> confirmed ─> preparing ─> ready ─┬────────────────> completed
   │                                                └─> out_for_delivery ─> completed
   ├─cancel─> cancelled     (customer, while pending/confirmed AND unpaid)
   └─void───> voided        (cashier/admin; auto-refunds if paid)
```

`payment_status` is tracked separately from `status`:

```
unpaid ─(gcash)─> processing ─webhook─> paid
   │                   └──────────────> failed
   └─(cash at POS / collected on delivery)──> paid

paid ─void─> refund_pending ─> refunded
                   └─────────> refund_failed ─(admin retry)─> refund_pending
```

Channel rules:

| | Kiosk | POS | Online |
| --- | --- | --- | --- |
| Fulfillment | `dine_in`, `take_out` | `dine_in`, `take_out` | `delivery`, `pickup` |
| Cash | settled at the counter | settled at the counter | on delivery, or at pickup |
| GCash | paid at the terminal, then auto-confirmed straight to the kitchen | paid at the counter | paid before the kitchen sees it |

## Endpoints

All paths are prefixed with `API_PREFIX` (default `/api/v1`). Single resources return `{ data }`; lists return `{ data, meta: { page, limit, total, pages } }`; errors return `{ error: { message, details? } }`.

### Shared

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/menu` | Whole menu, nested categories → products → variants. `?include_unavailable=true` for POS/admin. |
| `GET` | `/categories` | |
| `GET` | `/products` | `?page&limit&search&category_id&available` |
| `GET` | `/products/:id` | |
| `GET` | `/health`, `/health/supabase` | |

### Auth — `/auth`

`POST /register` · `POST /login` · `POST /refresh` · `POST /logout` · `GET /me`

### Kiosk — `/kiosk` (header `X-Kiosk-Key`)

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/kiosk/orders` | `{ fulfillment_type, customer_name, payment_method, items[], notes? }` → `{ order, payment }`. For GCash, `payment.checkout_url` is the redirect. |
| `GET` | `/kiosk/orders/:id` | Poll for payment/confirmation. Scoped to the calling device. |
| `POST` | `/kiosk/orders/:id/payment` | Retry an abandoned/failed GCash attempt. |

A kiosk has no auth user, so it cannot use Supabase Realtime (RLS would return it nothing) — it polls the endpoint above instead.

### POS — `/pos` (role `cashier` / `admin`)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/pos/orders` | The queue. `?status&payment_status&channel&q` — `q` matches order number **or** customer name. This is how a kiosk order is fetched at the counter. |
| `GET` | `/pos/orders/:id` | |
| `POST` | `/pos/orders` | Walk-in order rung up at the counter. |
| `PATCH` | `/pos/orders/:id/items` | Replace the item list; recomputes the total. `pending`/`confirmed` only. |
| `POST` | `/pos/orders/:id/confirm` | `pending → confirmed`. |
| `PATCH` | `/pos/orders/:id/status` | Advance the order; illegal transitions are rejected with `409`. |
| `POST` | `/pos/orders/:id/payment/cash` | `{ tendered_amount? }` → marks paid, returns change in `meta`. |
| `POST` | `/pos/orders/:id/payment/gcash` | Starts a GCash charge at the counter. |
| `POST` | `/pos/orders/:id/void` | `{ reason }`. Auto-refunds a paid GCash order. |

### Online customer — `/orders`

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/orders` | The caller's own orders (RLS-scoped). |
| `GET` | `/orders/:id` | |
| `POST` | `/orders` | `{ fulfillment_type: delivery\|pickup, payment_method, delivery_address?, items[], notes? }`. Address required for delivery. |
| `POST` | `/orders/:id/payment` | Start/retry GCash. |
| `POST` | `/orders/:id/cancel` | Only while `pending`/`confirmed` **and** unpaid. |

### Rider — `/rider` (role `rider`)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/rider/pool` | Unclaimed `ready` delivery orders. |
| `POST` | `/rider/orders/:id/claim` | First rider wins; the loser gets `409`. |
| `POST` | `/rider/orders/:id/unclaim` | Return it to the pool. |
| `GET` | `/rider/orders` | `?active=true` current, `?active=false` history. |
| `POST` | `/rider/orders/:id/delivered` | `{ collected_amount? }` — required for cash-on-delivery. |

### Admin — `/admin` (role `admin`)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/admin/orders` | All orders. `?status&payment_status&channel&from&to` |
| `POST` | `/admin/orders/:id/refund/retry` | Retry a refund PayMongo rejected. |
| `GET`/`POST` | `/admin/riders` | List / create rider accounts. |
| `PATCH` | `/admin/riders/:id` | Deactivate or correct a rider. |
| `GET`/`POST` | `/admin/kiosks` | List / issue a device key. |
| `DELETE` | `/admin/kiosks/:id` | Revoke a device. |
| `PATCH` | `/admin/users/:id/role` | Change a user's role. |

Menu management (`POST/PATCH/DELETE` on `/categories` and `/products`) currently sits on those routers, gated by role.

### Webhooks

`POST /webhooks/paymongo` — mounted **before** the JSON body parser so signature verification sees the raw bytes, and before the rate limiter. Verifies the `Paymongo-Signature` HMAC, rejects payloads older than 5 minutes, and records `event_id` before applying so a retried delivery cannot double-apply.

## Authorization model

Two layers, deliberately:

- **App layer** — `requireRole` / `requireKiosk` gate every staff, rider, kiosk and admin route, which then execute with the **secret-key** Supabase client.
- **Row Level Security** — still enforced, because **Supabase Realtime obeys RLS**. The policies are what scope each frontend's live subscription: a customer sees only their own orders, a cashier sees all, a rider sees the unclaimed `ready` delivery pool plus their own deliveries.

Customer self-service reads go through the caller-scoped client so RLS applies to them directly.

`orders` and `order_items` are in the `supabase_realtime` publication, so POS and rider screens should subscribe to Postgres changes rather than polling.

## Database

Schema lives in `supabase/migrations/`, applied in filename order. The menu is generated:

```bash
# edit supabase/seed-data/menu.json, then
node supabase/generate-seed.mjs    # regenerates supabase/seed.sql
```

The seed is idempotent (`ON CONFLICT DO NOTHING`), so re-running it is safe.

Notes:
- Prices are `numeric(10,2)` and **nullable** — null means "priced on variants" (Bilao trays) or "not set yet" (softdrinks). Ordering an unpriced item is rejected with `409`.
- Money is computed in integer centavos in `services/orders.js`; PayMongo bills in centavos too.
- `order_number` (`K-0042`, `P-0013`, `O-0108`) is assigned by a trigger and resets daily **in Asia/Manila time**, not UTC — a 9pm order must not land in tomorrow's sequence or sales report.

## Testing

```bash
npm test                  # 296 tests: unit, integration, end-to-end
npm run test:unit         # pure logic, no server needed (~1s)
npm run test:integration  # one endpoint at a time
npm run test:e2e          # multi-step journeys
```

Seed the test accounts once — this also writes their passwords into `.env`,
so `npm test` needs nothing exported:

```bash
node --env-file=.env scripts/seed-accounts.mjs
node --env-file=.env scripts/dev/seed-test-users.mjs
npm test
```

The suite boots its own server on port 4100, so it never collides with `npm run dev`. Full details in [docs/AUTOMATED-TESTING.md](docs/AUTOMATED-TESTING.md).

## Known gaps

- **Shared POS login** means voids and cash settlements cannot be attributed to an individual cashier. Consider stamping a per-shift cashier name before real money flows.
- **Rider cash reconciliation** — `collected_amount` is recorded on delivery, but there is no remittance report for riders handing cash in.
- **A browser kiosk's device key is extractable** by anyone with devtools on that terminal. It is a revocable device identifier, not a secret; a native kiosk shell would be stronger.
- **GCash is untested against live PayMongo** — the flow, webhook handling and refunds are implemented and unit-verified, but no PayMongo account has been connected yet.
