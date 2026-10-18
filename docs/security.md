# Security

What protects the system, what each protection relies on, what has gone wrong before, and what is still open.
Read this before putting real customers or real money through it.

**Contents:** [Principles](#principles) · [What each person can do](#what-each-person-can-do) ·
[Controls](#controls) · [Rate limits](#rate-limits) · [Secrets](#secrets) ·
[Issues found and fixed](#issues-found-and-fixed) · [Known gaps and accepted risks](#known-gaps-and-accepted-risks) ·
[Before going live](#before-going-live) · [Reporting a problem](#reporting-a-problem)

---

## Principles

1. **The browser is untrusted.** Prices, totals, roles and payment states sent by a browser are ignored and
   recomputed by the database.
2. **The database is the authority.** Browsers write to Supabase directly (there is no API server), so every write is
   allowed by a row-level security policy for that role and branch, and the money rules are triggers: prices come from
   the menu, the total is the sum of the items, a new order starts pending and unpaid, and a customer or rider can only
   make the moves the app offers them. The controllers check the same rules first, for clear messages.
3. **The secret key stays on the server.** Only Next.js server actions (gates, kiosk, guest chat, staff accounts,
   sales report, password change) use it, and the build refuses to bundle it for the browser.
4. **The database also checks formats.** Lengths and limits are `CHECK` constraints too, so a script that bypasses the
   app still cannot store bad data.
5. **Secrets are hashed or kept server-side.** Nothing a browser holds (a kiosk key, a guest chat token) is stored in
   a recoverable form on the server.
6. **Least privilege per role,** and role decided only by the server.
7. **Branch isolation.** Staff see and act on only the branches they work at; only the super admin sees all.

## What each person can do

| | Read | Write |
| --- | --- | --- |
| **Visitor** | Menu, site images; their own guest chat (with the token) | Start and use a guest chat |
| **Customer** | Own orders, payments, profile, own delivery chat | Place and cancel own orders, edit own name/phone/address, change password |
| **Cashier** | Their branch's orders and payments; their branch's website chats | Run orders, take payments, void, walk-ins, reply to chats (their branch) |
| **Rider** | Their branch's unclaimed ready deliveries, and their own | Claim (their branch only), release, deliver (record cash), chat on their delivery |
| **Kiosk device** | Orders that device placed | Place orders (at its branch) |
| **Admin** | Everything a cashier sees, for each of **their branches** | Riders, kiosks, employee passwords, sold out, refunds, for their branches only |
| **Super admin** | Everything, every branch | Also branches, admin accounts, the shared menu and prices, site images, roles |

A customer asking for someone else's order gets **404**, not 403, so the answer does not even confirm the order
exists; staff asking for another branch's order get the same 404, and asking to list or act on a branch they do not
work at is **403**. Rider and admin routes also refuse accounts that have been deactivated, on every request.

## Controls

### Identity and roles

- Logins are Supabase Auth (email or Google). Every request carries the user's token; server actions verify it with Supabase Auth.
- **A role is read only from `app_metadata.role`**, which only the server can write. `user_metadata` is editable by the
  user and is never trusted. A login with no role is a customer. Registration can only ever create customers.
- The role is kept in two places that must agree (`app_metadata.role` in the token, `profiles.role` for listings) and
  only the server-side account helpers change them together. Users may update only their own `full_name`, `phone` and
  `default_address` (a column-level grant), so nobody can edit their own role or active status.
- Cashier and kiosk use shared employee passwords **per branch**: the cashier's is that branch's shared cashier
  account's password; the kiosk's is stored as a salted `scrypt` hash per branch. A correct kiosk password mints a
  per-device key bound to that branch (below). One branch's password never opens another branch.

### Branch isolation

- Which branches an account works at is stored in `branch_staff` and **read by every policy** (`has_branch_access()`,
  not carried in the login token), so removing an admin from a branch applies to their very next request. A super admin is recognised by
  role and sees all.
- Every staff list is filtered to the caller's branches; asking for another branch is 403. Every action on a single
  order first loads it and checks its branch, answering 404 otherwise, so ids of other branches' orders are not even
  confirmed. Kiosks act for their device's branch; riders claim only from their branch's pool.
- Row-level security applies the same rule to live feeds through `has_branch_access()`, so a cashier's browser never
  receives another branch's orders or chats.
- Shared things (menu and prices, branches, admin accounts, site images, roles) are writable by the super admin only.
- Checked by `npm run check:flows` (a branch admin sees no other branch's kiosks, another customer cannot read an
  order).

### Row-level security

Every table has it on. Reads are scoped per role and branch; writes are allowed per role by the policies in
`supabase/migrations/20261018000000_nextjs_client_writes.sql`, and deactivated accounts lose write access at once
(`is_active_user()`). A customer *can* insert their own online order and its items, but the triggers replace any price
or total they send and refuse any status change other than cancelling or sending GCash proof. Server-only tables
(`kiosk_devices`, `employee_credentials`, `chat_thread_secrets`, `order_counters`) have no policies at all. See
[data-dictionary.md](./data-dictionary.md#who-can-read-and-write-what).

### Input validation

Three layers with the same rules (form, controller, database). Highlights: phone numbers must be 11 digits starting `09`; text
is trimmed; money has at most two decimals and a ceiling; quantities 1 to 99; map pins must be inside the Philippines.
Image links must be `http(s)`. User text used in searches is escaped, so punctuation cannot alter a query.
Full table: [data-dictionary.md](./data-dictionary.md#input-rules-the-same-everywhere).

### Uploads

- Type is decided from the file's **bytes**, not its name or declared type, and only JPEG, PNG and WebP pass.
- 5 MB limit in the app and again at the storage bucket.
- Chat photos go to a **private** bucket under their conversation's folder, are shown only through links that expire
  after an hour, and are capped at 30 per conversation. The storage path is never sent to browsers.
- A refused upload leaves nothing behind.

### Payments

- Prices are taken from the live menu by the database (a trigger), and the amount charged is the database's total.
- GCash is manual: a customer's reference number or receipt **never** marks an order paid by itself. Staff check it
  against the restaurant's GCash app and approve or reject it; at the counter the cashier checks the receipt and
  records its reference number. Every approval records who made it.
- Receipt screenshots are in a **private** bucket (`payment-receipts`), shown only through links that expire after an
  hour, to the customer who sent them and to staff of that branch. A receipt path sent back by the browser must belong
  to that order.
- Payment changes use conditional updates so simultaneous requests (double taps, two cashiers) cannot both succeed;
  an order can have only one paid cash payment and one GCash submission waiting at a time (database rules). Settling
  in cash replaces a GCash submission still waiting, so it cannot be approved as well.
- An order whose GCash payment is waiting to be verified cannot be voided until staff approve or reject it.

### Guests and kiosks

- A guest chat token and a kiosk device key are random, long, and stored **only as SHA-256 hashes**; comparisons are
  constant-time. A wrong token and an unknown conversation are indistinguishable.
- The live ping to a guest contains no message content.
- Kiosk keys can be revoked per device; revocation takes effect on the next request.

### Web layer

`next.config.ts` sets `Referrer-Policy: strict-origin-when-cross-origin` (OpenStreetMap never sees a full address such
as `/orders/<id>`), a `Permissions-Policy` that allows location to our own pages only and turns off camera, microphone
and payment APIs, and `X-Content-Type-Options: nosniff`. A Content-Security-Policy is still to be added at the host
(see [deployment.md](./deployment.md#building-and-hosting)). Server actions return a message and status, never a stack
trace.

### Data kept on the device, and caching

- Only **public** data is cached in the browser's storage (`3k.cache.*`): the menu (5 minutes), sold-out flags (30
  seconds), active branches and the logo (10 minutes). See `src/utils/cache.ts`.
- **Private** results (the caller's branches, their profile, the super admin's full branch list) are cached in memory
  only, never written to the device, and dropped the moment anyone signs out or a different user signs in
  (`clearPrivate()` in `AuthContext`). Orders, payments and chats are not cached at all.
- A cached menu can show a price that changed in the last few minutes, but orders are always priced by the database
  from the live menu (the `price_order_item` trigger), so nobody pays a stale price.
- Fonts are self-hosted (`next/font`), so visitors' browsers make no requests to Google.
- The Privacy Policy (`/privacy`) and Terms of Service (`/terms`) describe this. **Their text is a placeholder**: the
  contact addresses (`.example`), retention periods and refund times are made up and must be reviewed before going
  live.

## Rate limits

The Express API's in-memory rate limits did not survive the move to Next.js (serverless functions keep no memory
between requests). What remains is **Supabase Auth's own limits** on sign-in and sign-up. Nothing currently limits:

- wrong passwords at the **cashier gate** and the **kiosk unlock** (the old limit was 10 per 15 minutes per IP),
- password-change attempts,
- starting guest chats, guest messages and guest photos (the 30-photo cap per conversation still applies),
- kiosk orders per device.

The gates are the important ones: their passwords are short and shared. Restoring them needs a shared counter: a small
`rate_limits` table checked by the server actions, or a store such as Upstash. See
[Known gaps](#known-gaps-and-accepted-risks).

## Secrets

| Secret | Lives in | Never… |
| --- | --- | --- |
| Supabase **secret key** | `SUPABASE_SECRET_KEY`, server environment only | in a `NEXT_PUBLIC_` variable, in the browser bundle, in git, in logs |
| Supabase publishable key | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | (public by design) |
| Kiosk gate passwords (one per branch) | Hashed in `employee_credentials` | stored in plain text |
| Cashier passwords (one login per branch) | Supabase Auth (hashed) | |
| Kiosk device key, guest chat token | Browser; hash on the server | recoverable from the database |
| Google client secret | Supabase dashboard | in this repository |

`.env` files are ignored by git (root `.gitignore`); only the `*.example` files are committed. The `.mcp.json` file
contains only the Supabase project's address, no credentials. The development passwords in
[test-accounts.md](./test-accounts.md) are for **development only**.

---

## Issues found and fixed

Found in review or testing, each now covered by a test. Recorded because they explain why some rules look strict.

| Severity | Issue | Fix |
| --- | --- | --- |
| **Critical** | **Anyone could make themselves admin.** The API trusted a `role` inside `user_metadata`, which users can edit with the public key. A new account called `/admin/orders` after editing its own metadata and got a 200 | Role is read only from `app_metadata`; missing means customer. Regression test |
| **Critical** | **Customers could create free orders or mark their own order paid.** The original policies let a signed-in customer insert and update their own `orders` rows (and add items at any price) straight through the database | Those policies were removed; cancelling now goes through the API with an ownership check. Tests assert direct writes are refused |
| **High** | **Users could edit their own `profiles.role` / `is_active`** directly, so a deactivated rider could re-activate themselves | The update policy was dropped; profile edits go through the API with a whitelist of fields |
| **High** | **Voiding after a failed refund kept the customer's money**; the admin refund retry could never succeed | Voiding retries the refund and refuses to void while money is held; retry now finds failed refunds |
| **High** | **Payment notification failures were swallowed**, leaving a charged customer with an unpaid order | Failures are retried; late payments on voided orders are refunded |
| **High** | **Double payment** (GCash plus cash, or two cash requests at once) | Conditional updates, a one-cash-payment-per-order rule, and replacing a waiting GCash submission when paid another way |
| **High** | **Tomorrow's first order could not be created.** Order numbers restart daily but were globally unique, so `K-0001` collided with yesterday's | Uniqueness is per number *per Manila day* |
| **High** | **Deactivated riders kept working** until their token expired | Checked on every rider request |
| **Medium** | The shared sign-in client kept the last user's session, so later "anonymous" reads ran as that user | A fresh client per sign-in |
| **Medium** | Google sign-in revoked its own session, so users were bounced to login at checkout | The OAuth client's state is deleted directly instead |
| **Medium** | Order search broke on commas and brackets and could add its own filter conditions | User text is escaped/quoted |
| **Medium** | Editing a product's sizes failed once ordered; an order could be edited after payment began| Options are updated in place; edits blocked once payment starts |
| **Medium** | Logout ended the user's sessions on **every** device, including all registers sharing the cashier login | Logout ends only that device's session |
| **Low** | Kiosk failure screens never reset; modals let keyboard focus escape | Fixed (see [changelog.md](./changelog.md)) |
| **High** | **A rider's claim reset the order total to 0** (found while testing the move to browser writes). The guard trigger summed the order's items as the caller, and RLS hides an order's items from a rider until they hold it, so the cash-on-delivery check compared the cash against ₱0 | The sum runs with owner rights (`order_items_total()`, migration `20261018000100`). `check:flows` asserts the total survives a claim and short cash is refused |
| **Design** | **Moving writes into the browser** reopened the risk of free or self-paid orders that the 2026-09 fix had closed | Write policies are per role, and triggers own prices, totals and payment status; `check:flows` tries each tampering move |
| **Low** | With branch policies in place, an anonymous read of `orders` or chats failed with *permission denied for function has_branch_access* instead of returning nothing | The function is executable by `anon` (it answers false) and runs with the caller's rights rather than as a definer |

## Known gaps and accepted risks

| Gap | Impact | Mitigation / next step |
| --- | --- | --- |
| **Shared cashier login per branch** | Cash payments record *the branch's cashier account*, not the person on shift | Per-cashier accounts or a name prompt at shift start |
| **One branch per cashier login and rider** | A rider who covers two branches needs two accounts | Allow several rows in `branch_staff` for riders if that becomes common |
| **A kiosk's device key is extractable** by anyone with developer tools on that terminal | It is a revocable device identifier, not a true secret | Revoke devices from Admin → Kiosks; a locked-down kiosk shell would be stronger |
| **Logins are stored in the browser (`localStorage`)** | A cross-site-scripting bug anywhere would expose a session | React escapes output and the app renders no user HTML; add a Content-Security-Policy at the host (the app sets other headers, but no CSP yet) |
| **Leaked-password protection is off** in Supabase | Users may choose a password known from breaches | Turn it on: Authentication → Passwords |
| **Guests are anonymous** | Spam is limited only by the 30-photo cap | Tighten limits, add a challenge, or require a name |
| **A chat photo link works for up to an hour** for anyone who is given it | A person in the conversation could share it | Short expiry; only conversation members receive links |
| **Chat photos outlive a deleted conversation** | Orphaned files remain in storage | A periodic clean-up (see [operations.md](./operations.md#maintenance)) |
| **Map tiles and lookups go to OpenStreetMap from the browser** | OSM sees the searched address, the pinned coordinates and which map area is viewed | Disclose it; self-host a geocoder or tile server if privacy requires |
| **No rate limits on the password gates, password change or guest chat** | The cashier and kiosk passwords can be guessed without slowdown; guests can spam the inbox | A `rate_limits` table checked by the server actions, or Upstash (see [Rate limits](#rate-limits)) |
| **Orders have no duplicate protection** | A dropped connection plus a second tap can create two orders | An idempotency key on order creation |

## Before going live

- [ ] Change **every** development password: super admin, the Imus test admin, each branch's cashier and kiosk, the
      sample riders and customers. Delete the `@3k.local` test accounts. Keep [test-accounts.md](./test-accounts.md)
      out of public view, or delete it.
- [ ] Give each branch its real address, phone and opening hours (Admin → Branches); the seeds are 08:00–21:00 with
      no address.
- [ ] HTTPS everywhere; `SUPABASE_SECRET_KEY` set only as a server environment variable.
- [ ] Supabase: enable leaked-password protection; confirm only your real site addresses are in the redirect URL list;
      decide whether email confirmation is required.
- [ ] Keep the GitHub repository **private** (it contains development credentials in the docs).
- [ ] Add a Content-Security-Policy and standard headers at your host.
- [ ] Restore rate limits on the cashier and kiosk gates ([Rate limits](#rate-limits)).
- [ ] Turn on database backups and confirm you can restore.
- [ ] Replace the sample Privacy Policy and Terms (`src/view/presentation/legal/`) with reviewed text and real contact details.
- [ ] Run `npm run check:flows` against a **separate** project, never production.

The full checklist, with configuration, is in [deployment.md](./deployment.md#go-live-checklist).

## Reporting a problem

Treat anything that lets someone see another person's data, act as another role, or change money as urgent. Note what
was done and what happened, fix it behind a test that fails first, add a row to *Issues found and fixed* above, and
record the change in [changelog.md](./changelog.md).
