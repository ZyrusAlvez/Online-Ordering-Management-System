# Security

What protects the system, what went wrong before, and what is still open.

## Principles

1. **The browser is untrusted.** Prices, totals, roles and payment states it sends are ignored and recomputed.
2. **The database is the authority.** Browsers write to Supabase directly, so every write must pass an RLS policy for
   that role and branch, and the money and ordering rules are triggers ([architecture.md](./architecture.md#who-enforces-what)).
3. **The secret key stays on the server**, used only by server actions; the build refuses to bundle it for the browser.
4. **Formats are checked by the database too** (`CHECK` constraints), so scripts can't store bad data.
5. **Secrets are hashed:** kiosk device keys and guest chat tokens (SHA-256), the kiosk password (scrypt).
6. **Least privilege and branch isolation:** role comes only from `app_metadata`; staff see only their branches.

## What each person can do

| | Read | Write |
| --- | --- | --- |
| Visitor | Menu; their own guest chat (with its token) | Start and use a guest chat |
| Customer | Own orders, payments, profile, delivery chat | Place and cancel own orders, send GCash proof, edit name/phone/address, change password |
| Cashier | Their branch's orders, payments, website chats | Run orders, payments, voids, walk-ins, replies (their branch) |
| Rider | Their branch's ready deliveries, their own | Claim, release, deliver, record cash, chat on their delivery |
| Kiosk device | Orders it placed | Place orders at its branch |
| Admin | Everything a cashier sees, for **their branches** | Riders, kiosks, employee passwords, sold out, refunds (their branches) |
| Super admin | Everything | Also branches, admins, the shared menu, the logo |

Another customer's order, or another branch's order, answers **404** (its existence is not confirmed); listing another
branch is **403**. Deactivated accounts are refused on every request and lose write access at once.

## Controls

- **Identity:** Supabase Auth (email or Google). Server actions verify the access token with Supabase. The role lives in
  `app_metadata` (server-written) and `profiles.role` (kept equal); users can update only their own name, phone and
  address (column grant). Sign-up and Google always create customers.
- **Branch isolation:** `branch_staff` is read by every policy (`has_branch_access()`), so it also scopes live feeds; a
  removed branch applies on the next request. One branch's password never opens another.
- **Orders and money:** prices from the menu, totals from the items, new orders pending and unpaid, online-order rules
  (branch open and active, valid slot, delivery details), customers can't add items to a placed order, race guards on
  claims and payments. GCash proof never marks an order paid by itself; staff approve it, and every approval records who.
- **Uploads:** type from the file's bytes (JPEG/PNG/WebP), 5 MB in the app and the bucket. Receipts and chat photos are in
  private buckets behind 1-hour links; storage paths never reach browsers.
- **Web:** `Referrer-Policy: strict-origin-when-cross-origin` (OpenStreetMap never sees `/orders/<id>`),
  `Permissions-Policy` (location for our pages only; no camera, microphone, payment), `nosniff`. The image optimizer
  only resizes this project's menu photos. Errors return a message and status, never a stack trace.
- **On the device:** only public data is saved (`3k.cache.*`: menu, sold out, branches, logo). Private results live in
  memory for 5 s and are cleared on sign-out or user change. Fonts are self-hosted (no requests to Google).

## Rate limits

Counted in the database (`rate_limits`) so they work on serverless hosting. Same numbers as the old Express API.

| What | Limit | Per |
| --- | --- | --- |
| Wrong cashier passwords | 10 / 15 min (correct ones don't count) | IP |
| Wrong kiosk passwords | 10 / 15 min (correct ones don't count) | IP |
| Password changes | 10 / 15 min | account |
| Forgot password lookups (they say whether an email has an account) | 10 / 15 min | IP |
| Reset codes | 1 / 30 s (the Resend countdown) | email |
| Kiosk orders | 30 / min | device |
| New guest chats / messages / photos | 5 / h, 20 / min, 10 / 10 min | IP |

The IP is the first `x-forwarded-for` entry: Vercel sets it, other hosts must have their proxy overwrite it. If the
counter can't be reached, the request is allowed. Supabase Auth adds its own sign-in limits, and its own
minimum interval between emails to one address (SMTP settings; set it to 30 s to match).

## Secrets

| Secret | Lives in |
| --- | --- |
| Supabase secret key | `SUPABASE_SECRET_KEY`, server environment only |
| Publishable key | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (public by design) |
| Kiosk passwords | scrypt hashes in `employee_credentials` |
| Cashier passwords | Supabase Auth (the branch register accounts) |
| Kiosk device keys, guest chat tokens | The browser; only hashes on the server |
| Google client secret | Supabase dashboard |

`.env*` files are git-ignored except `.env.example`. Development logins are in [credentials.md](./credentials.md): keep
the repository private and change them before going live.

## Issues found and fixed

| Severity | Issue | Fix |
| --- | --- | --- |
| Critical | Anyone could make themselves admin by editing `user_metadata.role` | Role only from `app_metadata` |
| Critical | Customers could create free orders or mark their own order paid | Triggers own prices, totals and payment status |
| High | Users could edit their own `profiles.role` / `is_active` | Column grant: only name, phone, address |
| High | Double payment (GCash + cash, or two cash taps) | Conditional updates, one-cash-payment rule, cash replaces waiting GCash proof |
| High | The second day's first order collided with yesterday's number | Unique per branch per Manila day |
| High | Deactivated riders kept working until their token expired | Checked on every request |
| High | A rider's claim reset the order total to 0 | Total summed with owner rights (`order_items_total`) |
| Medium | Ordering rules (open branch, valid time, delivery details) could be skipped with a direct API call | `check_online_order` trigger |
| Medium | No rate limits after leaving Express | Database-backed limits |
| Medium | Logout ended every device's session (all registers share a login) | Logout ends this device only |
| Medium | Order search could be broken by punctuation | User text escaped |
| Low | Chat participants could edit any thread field; customers could add items to a placed order | `guard_chat_thread`; items only in the placing request |

Each is covered by `npm run check:flows`.

## Known gaps

| Gap | Mitigation |
| --- | --- |
| Shared cashier login per branch: cash isn't attributed to a person | Per-cashier accounts or a name prompt |
| A kiosk's device key can be read with developer tools on that terminal | Revocable per device |
| Sessions are in `localStorage`; an XSS bug would expose them | React escapes output, no user HTML; add a CSP |
| Leaked-password protection is off in Supabase | Turn it on (Authentication → Passwords) |
| Guests with many IP addresses get past the chat limits | Add a challenge (e.g. Turnstile) |
| Chat photo links work for an hour for anyone given one | Short expiry; links only to members |
| OpenStreetMap sees searched addresses and the map area | Disclosed; self-host if needed |
| No duplicate-order protection | Idempotency key on order creation |

Go-live steps are in [setup.md](./setup.md#go-live-checklist). Anything that exposes another person's data, lets someone
act as another role, or changes money is urgent: fix it behind a test that fails first and add a row above.
