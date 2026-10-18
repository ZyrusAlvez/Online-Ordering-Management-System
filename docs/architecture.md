# Architecture

How the code is organised, where each rule is enforced, how sign-in and live updates work, and where a change belongs.
For *what* the system does, read [how-it-works.md](./how-it-works.md); for the big picture, [overview.md](./overview.md).

**Contents:** [The shape](#the-shape) · [Layers](#layers) · [Who enforces what](#who-enforces-what) ·
[Server actions](#server-actions) · [Sign-in and sessions](#sign-in-and-sessions) · [Live updates](#live-updates) ·
[Walk-throughs](#walk-throughs) · [Database](#database) · [Storage](#storage) ·
[Where does my change go?](#where-does-my-change-go)

---

## The shape

One Next.js app (App Router, TypeScript) and Supabase. There is no separate API server: the app talks to Supabase
directly, and the few things that need the secret key run as Next.js **server actions** in the same app.

```
browser                                                         Supabase
  app/ (routes) ─▶ view/ (screens) ─▶ controllers/ ─▶ models/ ─▶ Postgres (RLS + triggers), Storage, Realtime
                                         │
                                         └─▶ controllers/server/ ('use server') ─▶ models/server/ ─▶ secret key
                                             runs on the server, only for what the browser may not do
```

The structure follows the team's Pasuyo project (`app/`, `controllers/`, `models/`, `view/components`,
`view/presentation/<feature>`), with one deliberate difference: the secret key never reaches the browser.

## Layers

```
src/
  app/                 routes only: each page.tsx renders one screen from view/presentation
                       /, /login, /register, /auth/callback, (customer)/{menu,checkout,orders,orders/[id],profile},
                       /cashier, /kiosk, /driver, /admin/{sales,orders,menu,riders,kiosks,settings,branches,admins,branding}
  view/
    components/        shared UI: ui (Button, Card, Field, Modal…), MenuBrowser, AddressFields/Map, BranchMap,
                       BranchList, StaffBranch, ScheduleField, Layouts, guards, chat/*
    presentation/      one folder per feature: landing, auth, customer, cashier, kiosk, driver, admin
  controllers/         the business rules. Validate input, check who is calling, call models, return Result<T>
    server/            'use server' actions plus server-only helpers (accounts, kioskDevices, serverCaller)
  models/              one file per table group: the Supabase queries, nothing else
    server/            the same, with the secret key ('server-only')
  context/             AuthContext (session from Supabase), CartContext, ToastContext
  hooks/               useBranches, useSiteImage, useGcash, useChat (inbox + visitor), usePosition,
                       realtime (subscriptions), hooks (useFetch, useDebounced, useTick)
  utils/               supabase.ts (the browser client), supabaseAdmin.ts (secret key, server-only),
                       result.ts, apiError.ts, validate.ts, validators/ (zod), navigation, format, geo, geocode,
                       schedule, image, kioskKey, manilaDate, server/password
  constants/orders.ts  statuses, allowed moves, roles, the order select
```

**The rule that keeps it readable:** screens call controllers, never models or Supabase. Controllers never render.
Models only query.

**Screens render in the browser only.** They read browser storage while rendering (the session, the cart, the chosen
branch, the kiosk key), which the server cannot see, so `src/app/providers.tsx` shows the loader until the app has
started in the browser; otherwise the server's HTML would differ from the first browser render (React error #418).
This matches the single-page app the screens came from.

**Loading shows skeletons, not spinners.** Each screen renders its frame (header, tabs, filters, forms) at once and
shows grey placeholder shapes only where data is still coming: `Skeleton` and `SkeletonGroup` in
`view/components/ui.tsx`, shared shapes in `view/components/Skeletons.tsx` (menu, chat, rows, maps), and each feature's
own in `view/presentation/<feature>/SkeletonLoading.tsx`. A new screen that loads data should do the same. The only
full-page loader left is "Signing you in…" on the Google callback, which is an action, not data.

**Caching** (`src/utils/cache.ts`). Controllers wrap reads in `cached(key, { ttlMs, kind }, load)`. `kind: 'public'`
(menu, sold-out flags, branches, logo) is kept in memory and in `localStorage`, so a returning visitor sees the menu at
once; `kind: 'private'` (the caller's branches, their profile) is kept in memory only and cleared by `clearPrivate()`
whenever the signed-in user changes. Writes call `invalidate(prefix)`, so the editor sees their change immediately
(other browsers within the TTL). Orders, payments and chats are never cached; live updates refetch them. Order prices
never come from a cache: the database prices every order from the live menu.

| Piece | Job |
| --- | --- |
| `utils/result.ts` | `Result<T>`: `{ success: true, data }` or `{ success: false, error, status }`. Every controller returns one. `status` keeps the HTTP-style codes (404, 409, …) screens use to tell a conflict from a failure |
| `utils/apiError.ts` | `call(result)` returns the data or throws an `ApiError` (`status`, `message`, `friendly`); `respond(result)` wraps it as `{ data }`. Screens catch these exactly as they caught the old API client's errors |
| `utils/validators/` | The zod schemas for every input (`fields.ts` holds the shared field rules). Controllers run them through `validate()` |
| `controllers/callerController.ts` | `getCaller(roles?)`: the signed-in user, their role (from `app_metadata`) and the branches they work at; `canAccessBranch()` |
| `controllers/server/serverCaller.ts` | The same for server actions: verifies the access token the browser passes, checks `is_active` |
| `utils/navigation.tsx` | `Link`, `NavLink`, `useNavigate`, `Navigate`, `useLocation`, `useParams` on top of Next.js navigation |
| `utils/schedule.ts` | When an online order may be for (`orderTimeProblem`), and the 15-minute slots checkout offers |

## Who enforces what

The browser writes to Supabase directly, so the rules a server used to enforce now live in two places:

| Rule | Controller (for good messages) | Database (cannot be bypassed) |
| --- | --- | --- |
| Prices come from the menu | `priceOrder` checks availability, sold out, options | `price_order_item` trigger replaces any `unit_price` sent |
| Total is the sum of the items | computed in centavos | `recompute_order_total` and `guard_order` triggers |
| New order starts pending and unpaid | sets it | `guard_order` forces it |
| A customer may only cancel or send GCash proof | `cancelMyOrder`, `submitGcashProof` | `guard_order` refuses anything else |
| A rider may only claim, return, deliver, collect cash | `riderController` | `guard_order` + rider policies |
| Who may see or change which branch | `getCaller` + `canAccessBranch` | `is_counter_staff()`, `is_branch_admin()`, `has_branch_access()` in the policies |
| A deactivated account stops working | `verifyCaller` (server actions) | `is_active_user()` in every write policy |
| Field formats and lengths | zod schemas | `CHECK` constraints |
| Order and payment race guards | conditional updates (`.eq('status', current)`) | the same update matches zero rows for the loser |

Server-side code (server actions) uses the secret key, which skips RLS; the guard triggers only act on browser requests
(`anon` / `authenticated`). The full list of policies is in `supabase/migrations/20261018000000_nextjs_client_writes.sql`.

## Server actions

Everything in `src/controllers/server/*Actions.ts` starts with `'use server'`. **Every export of such a file is a public
endpoint any browser can call**, so each one checks its caller first; helpers that must not be callable
(`accounts.ts`, `kioskDevices.ts`, `serverCaller.ts`) are separate `server-only` modules.

| File | What | Why it is on the server |
| --- | --- | --- |
| `employeeActions.ts` | Cashier gate login, kiosk unlock | Looks up the branch's cashier account; checks the scrypt kiosk password |
| `kioskActions.ts` | Kiosk "who am I", place order, read own order | A kiosk has no account; it presents a device key |
| `visitorChatActions.ts` | Guest chat: start, read, send, send photo | A guest has no account; the thread token's hash must stay secret |
| `staffActions.ts` | Riders, admins, kiosk devices, employee passwords, sales report | Creates and edits other people's accounts (Auth admin API) |
| `accountActions.ts` | Change own password | Re-checks the current password first |

The browser passes its access token (`accessToken()` from `AuthContext`); `verifyCaller` validates it with Supabase Auth.

## Sign-in and sessions

```
Email + password:  login screen ─▶ authController.login ─▶ Supabase Auth ─▶ session in localStorage (3k.auth)
Google:            supabase.auth.signInWithOAuth (PKCE) ─▶ Google ─▶ /auth/callback ─▶ exchangeCodeForSession
Cashier gate:      password ─▶ employeeActions.loginCashier (server) ─▶ tokens ─▶ authController.adoptSession
Kiosk gate:        password ─▶ employeeActions.unlockKiosk (server) ─▶ a device key in localStorage (3k.kioskKey)
```

- One Supabase client (`utils/supabase.ts`) holds the session and refreshes it automatically; `AuthContext` listens to
  it, including sign-in and sign-out in other tabs.
- The role is read **only** from `app_metadata.role` (server-written). No role means `customer`. `user_metadata` is
  editable by users and is never trusted.
- Sign-out ends **only this device's** session (`scope: 'local'`), because a branch's cashier login is shared.
- Route guards (`view/components/guards.tsx`) only decide what to render; the database and server actions check again.

## Live updates

| Who | Mechanism |
| --- | --- |
| Signed in (customer, cashier, admin, rider) | Supabase **postgres_changes** on `orders`, `chat_messages`, `chat_threads`; RLS scopes what each receives |
| Guests chatting | A **broadcast** ping on `chat:<thread id>`, then a fetch with the guest's token |

Every event is only a signal to refetch through the controllers (`hooks/realtime.ts`). Chat screens also refresh every
20 s in case a socket drops.

## Walk-throughs

### A customer places a delivery order

```
Checkout ─▶ orderController.placeOnlineOrder(body)
   validate(createOnlineOrderSchema) ─▶ branch open / slot valid (utils/schedule) ─▶ priceOrder (live prices)
   orderModel.insertOrder ── guard_order: pending, unpaid, total 0 ─▶ trigger assigns O-0001
   orderModel.insertOrderItems ── price_order_item: menu price ─▶ recompute_order_total: total = Σ items
   (items failed? delete the empty order)
Realtime: the orders row ─▶ the cashier's POS refetches its queue
GCash: uploadReceipt (private bucket, policy: own order) ─▶ submitGcashProof ─▶ payment_status processing
```

### A rider claims and delivers

```
riderController.claimOrder ─▶ update … where status = ready and rider_id is null   (the loser matches 0 rows: 409)
markDelivered(collected) ─▶ settleCashInternal (amount ≥ total) ─▶ payments row (cash, paid) ─▶ completed
```

## Database

- **Migrations are the source of truth** (`supabase/migrations/`, applied in filename order). Never edit one that has
  been applied; add a new one. Each starts with a comment explaining why it exists.
- **Every table has RLS on.** Reads are open as the screens need; writes are allowed per role by the policies in
  `20261018000000_nextjs_client_writes.sql`, and the money rules are triggers (see [above](#who-enforces-what)).
- **Server-only tables** (no policies, secret key only): `kiosk_devices`, `employee_credentials`,
  `chat_thread_secrets`, `order_counters`.
- **SQL functions:** `auth_role()`, `has_branch_access()`, `is_active_user()`, `is_super_admin()`,
  `is_counter_staff()`, `is_branch_admin()`, `is_client_request()`, `chat_partner_name()`, `order_items_total()`,
  `handle_new_user()`, `next_order_number()` / `set_order_number()`, `sales_report()`. Table detail is in
  [data-dictionary.md](./data-dictionary.md).

## Storage

| Bucket | Visibility | Holds | Who may write |
| --- | --- | --- | --- |
| `menu-images` | Public | Product photos, the logo | Super admin |
| `payment-receipts` | Private, signed links | GCash receipts, `<order id>/…` | The order's customer (staff of the branch may read) |
| `chat-images` | Private, signed links | Chat photos, `<thread id>/…` | Whoever can read the thread; guests through the server action |

## Where does my change go?

| Changing… | Edit |
| --- | --- |
| A page or its URL | `src/app/…/page.tsx` |
| What a screen shows | `src/view/presentation/<feature>/` |
| Something several screens share | `src/view/components/` |
| What an input must contain | `src/utils/validators/` (and the DB constraint, the data dictionary) |
| A business rule | `src/controllers/` (and the trigger/policy if it is about money or access) |
| A query | `src/models/` |
| Something that needs the secret key | `src/controllers/server/` (`'use server'` files check the caller first) |
| A status name or allowed move | `src/constants/orders.ts` |
| Who may write which rows | a **new** migration in `supabase/migrations/`, then [data-dictionary.md](./data-dictionary.md) |
| Colours, radius, fonts | `src/app/globals.css` tokens, then `view/components/ui.tsx` |
| A setting per environment | `.env.example`, [deployment.md](./deployment.md) |

Then run `npm run typecheck`, `npm run build` and `npm run check:flows` ([testing.md](./testing.md)), and update the docs
([README](./README.md#keeping-the-documentation-true)).
