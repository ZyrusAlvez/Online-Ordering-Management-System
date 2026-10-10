# Architecture

How the code is organised, how data and live updates flow, and where a change belongs. For *what* the system does,
read [how-it-works.md](./how-it-works.md); for the big picture, [overview.md](./overview.md).

**Contents:** [Backend](#backend) · [Frontend](#frontend) · [Live updates](#live-updates) ·
[Sign-in and sessions](#sign-in-and-sessions) · [Walk-throughs](#walk-throughs) · [Database](#database) ·
[Storage](#storage) · [Where does my change go?](#where-does-my-change-go)

---

## Backend

A Node/Express API in ES modules, strictly layered so every file does one job:

```
request ─▶ routes ─▶ middleware ─▶ controller ─▶ service ─▶ Supabase
           (path)    (auth, validate)  (HTTP in/out)  (rules + data)
```

```
backend/src/
  config/        env.js (validated at boot), supabase.js (the three clients)
  constants/     orders.js (statuses, allowed moves, roles and role groups, selects)
  validators/    zod schemas, one file per area; fields.js holds the shared field rules
  middleware/    auth.js (login + roles + active check), branch.js (branch scope, order-in-scope),
                 kiosk.js (device key + its branch), validate.js, upload.js (raw image bodies), errorHandler.js
  controllers/   read the request, call a service, shape the response (no queries)
  services/      the business rules and all database access (no req/res)
  routes/        path + middleware chain + controller, nothing else
  utils/         ApiError, asyncHandler, pagination, password hashing, manilaDate,
                 postgrest (safe search), findUser, branchScope (who may see which branch),
                 schedule (when an online order may be for)
  app.js         the middleware pipeline          server.js   entry point
```

**The rule that keeps it readable:** routes never contain queries, and services never touch `req` or `res`. A route
file reads as a table of contents.

### The request pipeline (`app.js`)

1. `helmet` (security headers), `cors` (only the configured origins), `compression`, request logging.
2. **Webhooks mount here**, before the JSON parser and the rate limiter, because the signature is computed over the
   exact raw bytes and PayMongo's retries must not be throttled.
3. JSON and form parsers (1 MB limit). Image routes read their own raw body (5 MB).
4. The global rate limiter (300 requests per 15 minutes per IP by default; kiosk payment polling is exempt).
5. The routes under `/api/v1`, then the not-found and error handlers.

`TRUST_PROXY` tells Express how many proxies sit in front, so the rate limiter sees real client addresses.

### Interfaces, one namespace each

| Interface | Base path | Who may call it |
| --- | --- | --- |
| Public | `/branches`, `/menu`, `/categories`, `/products` (reads), `/site/images`, `/health`, `/chat/visitor/*` | Anyone |
| Auth | `/auth/*` | Login, register, refresh; profile and password need a token |
| Employee gates | `/employee/cashier/login`, `/employee/kiosk/unlock` | Anyone with the branch's shared password (rate limited) |
| Kiosk | `/kiosk/*` | A device key (`X-Kiosk-Key`), acting for its branch |
| POS | `/pos/*` | `cashier`, `admin` or `super_admin`, active, limited to their branches |
| Online customer | `/orders/*` | Any signed-in user, scoped to their own orders |
| Rider | `/rider/*` | `rider`, and not deactivated, limited to their branch |
| Admin | `/admin/*` | `admin` (their branches) or `super_admin` (all, plus branches, admins, site images, roles), active |
| Menu writes | `/categories`, `/products` (writes) | `super_admin` |
| Webhooks | `/webhooks/paymongo` | PayMongo, by signature |

One shared `/orders` that behaves differently per caller was rejected on purpose: it makes each app's contract
impossible to document and test. See [decisions.md](./decisions.md).

### Clients to the database (`config/supabase.js`)

| Client | Key | Used for |
| --- | --- | --- |
| `supabaseAdmin` | Secret key (bypasses row-level security) | Every write, and staff reads. The only client that may change data |
| `createAnonClient()` | Publishable key, **one per call** | Signing a user in or refreshing a session. A fresh client each time, because signing in stores the session on the client that did it, and a shared one would leak the last person's login into later "anonymous" calls |
| `supabaseAnon` | Publishable key, shared | Token checks and public reads only |
| `supabaseForToken(jwt)` | The caller's token | Reads that should obey row-level security as that user |

### Auth middleware (`middleware/auth.js`)

- `requireAuth`: validates the bearer token with Supabase and attaches `req.user`.
- `requireRole(...roles)`: reads the role **only** from `app_metadata.role` (server-written). No role means `customer`.
  `user_metadata` is editable by users and is never trusted. See [security.md](./security.md).
- `requireActive`: refuses accounts that were deactivated (rider, POS and admin routes).
- `middleware/branch.js`:
  - `loadBranchScope` attaches `req.branchScope`: `{ all: true }` for a super admin, otherwise the branch ids in
    `branch_staff`, **read on every request** so a change applies at once.
  - `requireOrderInScope` loads `:id` into `req.order`, or 404s if it belongs to another branch.
  - The rules themselves are pure functions in `utils/branchScope.js`: `branchFilter` (a list's branches; 403 for one
    outside the scope), `resolveBranch` (the one branch an action happens at), `assertBranchAccess`.
- `middleware/kiosk.js`: the kiosk's device key, compared by hash; attaches the device and its branch.

### Errors

Services throw `ApiError` (400/401/403/404/409…). The error handler returns
`{ error: { message, details? } }`; database errors are mapped to sensible codes (unique violation → 409, and so on).
Stack traces appear only outside production.

---

## Frontend

One Vite + React app serving every audience. Staff screens are code-split, so customers never download the cashier or
admin code, and the map library loads only when a delivery address is being entered.

```
frontend/src/
  App.jsx          routes and which role each needs
  pages/
    Landing, Login, Register, AuthCallback        public
    customer/    Menu, Checkout, Orders, OrderDetail, PaymentResult, Profile
    cashier/     CashierApp (password gate), Pos
    kiosk/       KioskApp (gate), KioskFlow, KioskPaymentResult
    driver/      Driver
    admin/       AdminApp (menu + routes + branch switcher), AdminSales, AdminOrders, AdminMenu, AdminRiders,
                 AdminKiosks, AdminSettings, AdminBranches, AdminAdmins, AdminBranding
  components/    ui.jsx (Button, Card, Field, Input, Modal, Segmented…), MenuBrowser, AddressFields,
                 AddressMap, BranchMap, BranchList, OrderBranchPicker, ScheduleField, StaffBranch,
                 mapPins, PhoneInput, ImageField, BottomDock, Avatar, Layouts, guards, chat/*
  context/       AuthContext (session + login), CartContext, ToastContext (sonner's Toaster + useToast)
  lib/           api.js, session.js, supabase.js, oauth.js, chat.js, hooks.js, format.js,
                 validation.js, image.js, geocode.js, siteImages.js, kiosk.js, branches.js,
                 geo.js (hours, location, distance), schedule.js (order time slots)
```

Key modules:

| Module | Job |
| --- | --- |
| `lib/api.js` | The only way the app talks to the API: adds the token, refreshes it once on a 401, sends images as raw bodies, turns errors into friendly messages |
| `lib/session.js` | The signed-in session, kept in `localStorage` (`3k.session`), shared across tabs; `roleOf()` |
| `lib/supabase.js` | The live-update client (subscriptions only; **never** used for writes) |
| `lib/hooks.js` | `useFetch` with stable `refresh`/`reload` so subscriptions are not rebuilt on every render |
| `lib/validation.js` | The field rules, mirroring the backend |
| `context/CartContext` | The cart in `localStorage` (`3k.cart`); cleared on sign-out; quantities clamped |
| `lib/branches.js` | The branch list (`GET /branches`, fetched once) and the customer's branch: `useSelectedBranch()` returns their pick, or the nearest branch once the location is known, or the first |
| `lib/geo.js` | Manila opening hours (`isOpenNow`, `hoursLabel`), the customer's location (asked once per page load, shared), distances and the nearest branch |
| `lib/schedule.js` | The 15-minute slots a branch offers for a scheduled order; mirrors `backend/src/utils/schedule.js` |
| `components/StaffBranch.jsx` | The staff branch context and switcher (admin, POS), built from the account's branches in `/auth/profile` |
| `components/BranchMap.jsx` | The landing-page map: every branch, fitted to their bounds; lazy-loaded with Leaflet |
| `components/ui.jsx` | The design system: buttons (also as links), cards, inputs, dialogs with focus trapping, segmented control |
| `components/BottomDock` | The one fixed bottom stack for the cart bar and chat button, so they never overlap; toasts appear at the top |

### Design system

Tokens live in `src/index.css` (`@theme`): brand red `#e8202a`, orange `#f79346`, ink `#2b1812`, a warm near-white page
`#fbf7f2`, white cards with 1px `#ece3da` borders, Poppins for text and Kaushan Script **only** for the wordmark and
the hero headline. Red is reserved for primary actions and prices. Radius and shadow scales are redefined there, so the
whole app inherits them.

### Browser storage

| Key | Holds | Cleared |
| --- | --- | --- |
| `3k.session` | The login (tokens + user) | Sign-out, or when the server rejects the session |
| `3k.cart` | The cart | Sign-out; after an order |
| `3k.branch` | The customer's branch and whether they chose it (`{ id, explicit }`) | Never automatically |
| `3k.adminBranch`, `3k.posBranch` | The branch a staff screen is looking at | Never automatically |
| `3k.registerBranch` | The branch a register (cashier gate) belongs to | Never automatically |
| `3k.chat` | A guest's conversation id and secret token | Never automatically (the guest's own conversation) |
| `3k.kioskKey` | A kiosk's device key | When the kiosk is locked or the key is revoked |
| `3k.oauth*` | Google sign-in's temporary state | Immediately after sign-in |

---

## Live updates

Three mechanisms, chosen by who can authenticate:

| Who | Mechanism | Why |
| --- | --- | --- |
| Cashier, admin, customer, rider (logged in) | Supabase **postgres_changes** on `orders`, `chat_messages`, `chat_threads` | Row-level security scopes the feed to what each may read, so a customer is never sent another's order and a cashier never another branch's |
| Guests chatting | **Broadcast** ping on `chat:<thread id>`, then a fetch with the guest's token | A guest has no login to scope a feed; the ping carries no content |
| Kiosk | **Polling** `GET /kiosk/orders/:id` every 2 s | It has no login either |

In every case the event is only a *signal to refetch over the REST API*; the data itself always comes from the API.
Chat clients additionally refresh about every 20 s, and the session keeper refreshes tokens in the background so a
realtime-only screen (the rider's) keeps a valid connection.

---

## Sign-in and sessions

```
Email + password:  browser ─▶ POST /auth/login ─▶ API ─▶ Supabase Auth ─▶ { user, session } ─▶ localStorage
Google:            browser ─▶ Supabase (PKCE) ─▶ Google ─▶ /auth/callback ─▶ exchange code ─▶ same session shape
Cashier / kiosk:   password ─▶ POST /employee/... ─▶ cashier session  /  a new kiosk device key
```

- After sign-in everything works the same whichever way you arrived: a Supabase session with access and refresh tokens.
- The Google flow uses a **separate** client only to complete the redirect. The app then keeps its own session, and
  that client's leftovers are deleted from storage. It must **not** call sign-out on it: that would end the very
  session just handed to the app (a bug that once made users bounce to the login page).
- `lib/api.js` retries once after a 401 by refreshing; it ends the session only if the server **rejects** the refresh
  token, not on a network error or server hiccup. `keepSessionFresh()` refreshes before expiry and when a tab wakes.
- Sign-out (`POST /auth/logout`) revokes **only that device's** session, because the cashier login is shared.

---

## Walk-throughs

### A customer places a delivery order

```
Checkout form ──▶ POST /orders { type, payment, phone, address(+pin), items[] }
   validators (fields.js) ─▶ orders.controller ─▶ order.service.createOrder
      priceOrder: look up live prices ─▶ total in centavos
      insert order (+ trigger sets order_number) ─▶ insert items (roll back the order on failure)
   ◀── 201 { order }   then, for GCash:  POST /orders/:id/payment ─▶ PayMongo ─▶ redirect URL
Realtime: orders row inserted ─▶ cashier's feed fires ─▶ POS refetches /pos/orders
```

### A chat photo

```
Attach ─▶ shrink in the browser ─▶ POST …/images (raw bytes)
   upload middleware (5 MB) ─▶ chat.service: authorise (token / role / order) ─▶ cap check
   check the real bytes ─▶ store in the private bucket ─▶ insert message(image_path) ─▶ ping/realtime
Other side refetches messages ─▶ service signs short-lived links ─▶ <img src=link>
```

---

## Database

- **Migrations are the source of truth** (`backend/supabase/migrations/`, applied in filename order). Never edit one
  that has been applied; add a new one. Each starts with a comment explaining the reason, and the live database should
  always equal "all migrations applied".
- **Conventions:** every table has row-level security on; policies are `SELECT`-only (writes are the API's job);
  helper functions use `security invoker` and `set search_path = ''`, then `revoke all … from public, anon,
  authenticated` (revoking only the named roles does not remove the default public access; the second hardening
  migration exists because of that).
- **Server-only tables** (no policies at all): `kiosk_devices`, `order_counters`, `webhook_events`,
  `employee_credentials`, `chat_thread_secrets`.
- **SQL functions:** `auth_role()` (role from the token, used by policies), `has_branch_access(branch)` (super admin,
  or the caller works at that branch; used by the staff policies), `handle_new_user()` (creates a profile at sign-up),
  `next_order_number()` / `set_order_number()` (per-branch, per-day numbering in Manila time), `sales_report()` (the
  dashboard, optionally for some branches). Table-by-table detail is in [data-dictionary.md](./data-dictionary.md).
- **Where each business rule is enforced** (form, API, database) is tabulated in the data dictionary's *Input rules*.

## Storage

| Bucket | Visibility | Holds |
| --- | --- | --- |
| `menu-images` | Public read | Product photos, the logo |
| `chat-images` | **Private** | Chat photos, shown only via short-lived signed links |

Neither bucket has any policy that lets a browser write; uploads go through the API with the secret key.

---

## Where does my change go?

| Changing… | Edit |
| --- | --- |
| The URL, method, or who may call it | `routes/` |
| What a request must contain | `validators/` (and `frontend/src/lib/validation.js`, the DB constraint, the data dictionary) |
| The shape of an HTTP response | `controllers/` |
| A business rule, or anything touching the database | `services/` |
| A status name or allowed move | `constants/orders.js` |
| Who may see which branch | `utils/branchScope.js`, `middleware/branch.js`, and the policies using `has_branch_access()` |
| When an online order may be for | `utils/schedule.js` and `frontend/src/lib/schedule.js` together |
| The database structure | a **new** migration, then [data-dictionary.md](./data-dictionary.md) |
| A screen | `frontend/src/pages/<audience>/` |
| Something shared by several screens | `frontend/src/components/` |
| Colours, radius, fonts | `frontend/src/index.css` tokens, then `components/ui.jsx` |
| A setting that varies per environment | `config/env.js`, `.env.example`, [deployment.md](./deployment.md) |

Then add a test ([testing.md](./testing.md)) and update the docs ([README](./README.md#keeping-the-documentation-true)).
