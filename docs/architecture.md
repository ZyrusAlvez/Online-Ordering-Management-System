# Architecture

One Next.js app (App Router, TypeScript, Tailwind 4) and Supabase (Postgres with RLS and triggers, Auth, Storage,
Realtime). No API server: the browser talks to Supabase directly, and the few things that need the secret key run as
**server actions** in the same app. Laid out MVC like the team's Pasuyo project, except the secret key never reaches
the browser.

```
browser                                                         Supabase
  app/ (routes) ─▶ view/ (screens) ─▶ controllers/ ─▶ models/ ─▶ Postgres (RLS + triggers), Storage, Realtime
                                         └─▶ controllers/server/ ('use server') ─▶ models/server/ ─▶ secret key
```

## Layout

```
src/
  app/                routes only; each page.tsx exports its title and renders one screen. error.tsx = crash page
  view/components/    shared UI: ui.tsx (Button, Card, Modal, Skeleton…), MenuBrowser, MenuPhoto, maps, chat/, guards
  view/presentation/  one folder per feature: landing, auth, customer, cashier, kiosk, driver, admin, legal
  controllers/        business rules: validate, check the caller, call models, return Result<T>
  controllers/server/ 'use server' actions + server-only helpers (accounts, kioskDevices, serverCaller, rateLimit)
  models/             Supabase queries only; models/server/ uses the secret key
  context/            AuthContext (session), CartContext, ToastContext (sonner)
  hooks/              useFetch, realtime subscriptions, useBranches, useSiteImage, useChat, usePosition
  utils/              supabase.ts (browser client), supabaseAdmin.ts (server-only), result, apiError, validators/ (zod),
                      cache, schedule, geo, format, navigation
  constants/orders.ts statuses, allowed moves, roles
supabase/             migrations/ (source of truth), seed.sql, seed-data/
scripts/dev/          the end-to-end checks
```

**Rule:** screens call controllers, never models or Supabase; controllers never render; models only query.

- **Results:** every controller and action returns `Result<T>` = `{ success: true, data }` or
  `{ success: false, error, status }` (`400` input, `401` signed out, `403` not allowed, `404` not found or not yours,
  `409` conflict or wrong state, `413/415` image, `429` too many attempts). Screens unwrap with `call()` / `respond()`,
  which throw `ApiError` (`status`, `friendly`). Database errors map through `fromDbError`; code `P0001` is a rule message
  shown as written.
- **Client-only rendering:** screens read browser storage (session, cart, branch, kiosk key), so `app/providers.tsx`
  renders after mount to avoid hydration mismatches. Loading shows **skeletons** where data goes (`Skeleton`; inside
  text use `as="span"`).
- **Caching** (`utils/cache.ts`): public data (menu, sold out, branches, logo) is stale-while-revalidate: a saved copy
  (memory, then `localStorage`) shows at once and the latest is fetched every time, re-rendering if it changed.
  Private data (your branches, profile) is never stored, only shared for 5 s in memory and cleared on user change.
  Orders, payments and chats are never cached; prices always come from the database.
- **Images:** menu photos go through `next/image` (`MenuPhoto`) at the drawn size; `next.config.ts` allows only this
  project's `menu-images` folder.

## Who enforces what

The browser writes to Supabase directly, so each rule is checked twice: by the controller (clear message) and by the
database (cannot be bypassed).

| Rule | Controller | Database |
| --- | --- | --- |
| Prices from the menu | `priceOrder` | `price_order_item` trigger |
| Total = sum of items | centavos math | `recompute_order_total`, `guard_order` |
| New order starts pending, unpaid | sets it | `guard_order` forces it |
| Kiosk and walk-in orders paid before the kitchen | `advanceStatus` (`mustPayFirst`) | `guard_order` |
| Online order: branch open/active, valid slot, delivery address + phone | `placeOnlineOrder` + `utils/schedule.ts` | `check_online_order` trigger |
| Customer may only cancel or send GCash proof; can't add items later | `cancelMyOrder`, `submitGcashProof` | `guard_order`, `price_order_item` |
| Rider may only claim, return, deliver, collect cash | `riderController` | `guard_order` + policies |
| Chat thread fields fixed; only staff mark read | `chatController` | `guard_chat_thread` |
| Branch access | `getCaller` + `canAccessBranch` | `has_branch_access`, `is_counter_staff`, `is_branch_admin` in policies |
| Deactivated accounts stop | `verifyCaller` | `is_active_user()` in write policies |
| Field formats | zod (`utils/validators/`) | `CHECK` constraints |
| Races (double tap, two riders) | conditional updates | the loser's update matches 0 rows → 409 |

Triggers act only on browser requests (`is_client_request()`); server actions use the secret key and skip RLS.

## What screens can call

**Controllers** (browser, as the signed-in user):

| Area | Functions |
| --- | --- |
| Public | `getActiveBranches`, `getMenu({ branchId })`, `getSiteImages`, `getGcashAccount` |
| Auth | `login`, `register`, `loginWithGoogle`, `finishGoogleLogin`, `adoptSession`, `logout` (this device) |
| Customer | `placeOnlineOrder`, `listMyOrders`, `getOrder`, `getOrderWithPayment`, `cancelMyOrder`, `uploadReceipt`, `submitGcashProof`, `getMyProfile`, `updateMyProfile`, delivery chat |
| Counter staff | `listStaffOrders`, `createWalkInOrder`, `replaceItems`, `advanceStatus`, `payCash`, `payGcashAtCounter`, `verifyGcash`, `voidOrder`, support-chat inbox |
| Rider | `getPool`, `getMyDeliveries`, `claimOrder`, `unclaimOrder`, `markDelivered`, delivery chat |
| Admin | `markRefunded`, `setSoldOut`; super admin: branches, menu (categories, products, photos), site images |

**Server actions** (`controllers/server/*Actions.ts`; every export is a public endpoint, so each checks its caller):

| Action | Who | Rate limit |
| --- | --- | --- |
| `employeeActions.loginCashier`, `unlockKiosk` | Anyone with the branch password | 10 wrong / 15 min per IP |
| `kioskActions.kioskMe`, `createKioskOrder`, `kioskOrder` | A kiosk device key (401 unknown, 403 revoked) | 30 orders / min per device |
| `visitorChatActions` create, read, post, post image | Anyone / the token holder | 5 chats / h, 20 msgs / min, 10 photos / 10 min per IP |
| `staffActions` riders, admins, kiosks, employee passwords, sales report | Admins (their branches), super admin | |
| `accountActions.changeMyPassword` | Email accounts except the shared cashier | 10 / 15 min per account |

Staff actions take the caller's access token and verify it (`verifyCaller`).

## Sign-in and live updates

- Email and Google (PKCE, code exchanged on `/auth/callback`) end in one Supabase session in `localStorage` (`3k.auth`).
- Sign-up confirmation and password-reset emails link to `/auth/confirm?token_hash=…&type=…`, checked with `verifyOtp`
  (not a PKCE code, so they open in any browser). A reset link signs the user in, then `/reset-password` sets the new
  password and signs out their other sessions. Templates: `supabase/templates/`.
  The cashier gate returns tokens from the server, adopted by the same client. The kiosk gets a device key (`3k.kioskKey`).
- Route guards (`view/components/guards.tsx`) only decide what to render; the database checks again.
- **Realtime:** signed-in users subscribe to `orders`, `chat_messages`, `chat_threads` (scoped by RLS); guests get a
  content-free broadcast ping on `chat:<thread id>`. Every event just means "refetch".

## Design decisions

- **No API server.** Supabase is the backend; rules moved into policies and triggers so browsers can't skip them.
- **Secret key server-only** (`server-only` import); Pasuyo ships it to the browser, this app doesn't.
- **Role only from `app_metadata`**; `user_metadata` is user-editable. No role = customer.
- **Branch access read on every request** (`branch_staff`), not cached in the token, so removal applies at once.
- **One shared menu, sold out per branch.** No per-branch prices.
- **Shared cashier login and kiosk password per branch.** Cash is attributed to the branch account, not a person.
- **Kiosk device keys** are hashed and revocable per device.
- **Server prices everything in centavos;** the paid price is saved per line.
- **Payment status separate from order status.**
- **Manual GCash, no payment provider:** a reference number proves nothing alone, so staff always verify.
- **First rider to claim wins** via one guarded update.
- **Order numbers per branch per Manila day,** short enough to call out.
- **Guests use a token + ping,** not anonymous sign-in (no dashboard setting, no user per visitor).
- **Sales is a database function** (the data API caps responses at 1,000 rows).
- **OpenStreetMap + Leaflet,** greyed out, no key; hand-built charts; sonner toasts.
- **Rate limits in the database,** since serverless functions keep no memory.
- **Tests run against the real database,** because RLS and triggers are exactly what mocks hide.

## Where a change goes

| Changing… | Edit |
| --- | --- |
| A page or URL | `src/app/…/page.tsx` |
| What a screen shows | `src/view/presentation/<feature>/` (shared bits in `view/components/`) |
| An input rule | `src/utils/validators/` + `src/utils/validation.ts` + the DB constraint + [database.md](./database.md) |
| A business rule | `src/controllers/` (+ a trigger or policy if it's about money or access) |
| A query | `src/models/` |
| Anything needing the secret key | `src/controllers/server/` |
| Statuses or allowed moves | `src/constants/orders.ts` |
| The schema or who may write | a **new** migration + [database.md](./database.md) + [setup.md](./setup.md) |
| A setting | `.env.example` + [setup.md](./setup.md) |

Then `npm run typecheck`, `npm run build`, `npm run check:flows`, and update the docs in the same commit.
