# Security

What protects the system, what each protection relies on, what has gone wrong before, and what is still open.
Read this before putting real customers or real money through it.

**Contents:** [Principles](#principles) · [What each person can do](#what-each-person-can-do) ·
[Controls](#controls) · [Rate limits](#rate-limits) · [Secrets](#secrets) ·
[Issues found and fixed](#issues-found-and-fixed) · [Known gaps and accepted risks](#known-gaps-and-accepted-risks) ·
[Before going live](#before-going-live) · [Reporting a problem](#reporting-a-problem)

---

## Principles

1. **The browser is untrusted.** It can ask; the server decides. Prices, totals, roles and payment states sent by a
   browser are ignored and recomputed.
2. **Browsers never write to the database.** All writes go through the API, which uses the secret key after checking
   who is asking. Database policies are read-only and exist to scope what each person may *see* (including live
   updates).
3. **The database also defends itself.** Formats, lengths and limits are checked there too, so a script that bypasses
   the app still cannot store bad data.
4. **Secrets are hashed or kept server-side.** Nothing a browser holds (a kiosk key, a guest chat token) is stored in
   a recoverable form on the server.
5. **Least privilege per role,** and role decided only by the server.
6. **Branch isolation.** Staff see and act on only the branches they work at; only the super admin sees all.

## What each person can do

| | Read | Write (through the API) |
| --- | --- | --- |
| **Visitor** | Menu, site images; their own guest chat (with the token) | Start and use a guest chat |
| **Customer** | Own orders, payments, profile, own delivery chat | Place and cancel own orders, edit own name/phone/address, change password |
| **Cashier** | Their branch's orders and payments; their branch's website chats | Run orders, take payments, void, walk-ins, reply to chats (their branch) |
| **Rider** | Their branch's unclaimed ready deliveries, and their own | Claim (their branch only), release, deliver (record cash), chat on their delivery |
| **Kiosk device** | Orders that device placed | Place orders (at its branch), retry GCash for them |
| **Admin** | Everything a cashier sees, for each of **their branches** | Riders, kiosks, employee passwords, sold out, refunds, for their branches only |
| **Super admin** | Everything, every branch | Also branches, admin accounts, the shared menu and prices, site images, roles |

A customer asking for someone else's order gets **404**, not 403, so the answer does not even confirm the order
exists; staff asking for another branch's order get the same 404, and asking to list or act on a branch they do not
work at is **403**. Rider and admin routes also refuse accounts that have been deactivated, on every request.

## Controls

### Identity and roles

- Logins are Supabase Auth (email or Google). The API validates the token on every request.
- **A role is read only from `app_metadata.role`**, which only the server can write. `user_metadata` is editable by the
  user and is never trusted. A login with no role is a customer. Registration can only ever create customers.
- The role is kept in two places that must agree (`app_metadata.role` in the token, `profiles.role` for listings) and
  only the profile service changes them together. The `profiles` table cannot be edited directly by users (no update
  policy), so a user cannot edit their own role or active status.
- Cashier and kiosk use shared employee passwords **per branch**: the cashier's is that branch's shared cashier
  account's password; the kiosk's is stored as a salted `scrypt` hash per branch. A correct kiosk password mints a
  per-device key bound to that branch (below). One branch's password never opens another branch.

### Branch isolation

- Which branches an account works at is stored in `branch_staff` and **read on every request** (not carried in the
  login token), so removing an admin from a branch applies to their very next request. A super admin is recognised by
  role and sees all.
- Every staff list is filtered to the caller's branches; asking for another branch is 403. Every action on a single
  order first loads it and checks its branch, answering 404 otherwise, so ids of other branches' orders are not even
  confirmed. Kiosks act for their device's branch; riders claim only from their branch's pool.
- Row-level security applies the same rule to live feeds through `has_branch_access()`, so a cashier's browser never
  receives another branch's orders or chats.
- Shared things (menu and prices, branches, admin accounts, site images, roles) are writable by the super admin only.
- Covered by `tests/integration/branch-scope.test.js` (an Imus admin, cashier and rider against GMA Terminal) and
  `scripts/dev/check-rls.mjs`.

### Row-level security

Every table has it on; every policy is `SELECT`-only. See [data-dictionary.md](./data-dictionary.md#who-can-read-and-write-what).
Customers have **no** insert or update access to `orders` or `order_items`, so they cannot create free orders or mark
their own order paid. Server-only tables have no policies at all.

### Input validation

Three layers with the same rules (form, API, database). Highlights: phone numbers must be 11 digits starting `09`; text
is trimmed; money has at most two decimals and a ceiling; quantities 1 to 99; map pins must be inside the Philippines.
Image links must be `http(s)`. User text used in searches is escaped, so punctuation cannot alter a query.
Full table: [data-dictionary.md](./data-dictionary.md#input-rules-the-same-everywhere).

### Uploads

- Type is decided from the file's **bytes**, not its name or declared type, and only JPEG, PNG and WebP pass.
- 5 MB limit at the web server and again at the storage bucket.
- Chat photos go to a **private** bucket under their conversation's folder, are shown only through links that expire
  after an hour, and are capped at 30 per conversation. The storage path is never sent to browsers.
- A refused upload leaves nothing behind.

### Payments

- Prices are computed on the server from the live menu; the amount charged is the server's total.
- Only PayMongo's **signed** notification marks an order paid. The signature is checked in constant time, notifications
  older than 5 minutes are refused, and each is recorded by id so a replay is ignored.
- If processing a notification fails it is retried by PayMongo rather than lost. Money for an order already voided or
  cancelled is refunded automatically.
- Payment changes use conditional updates so simultaneous requests (double taps, two cashiers) cannot both succeed;
  an order can have only one paid cash payment (a database rule). Starting GCash again cancels the earlier attempt.

### Guests and kiosks

- A guest chat token and a kiosk device key are random, long, and stored **only as SHA-256 hashes**; comparisons are
  constant-time. A wrong token and an unknown conversation are indistinguishable.
- The live ping to a guest contains no message content.
- Kiosk keys can be revoked per device; revocation takes effect on the next request.

### Web layer

`helmet` security headers; CORS limited to the configured origins; request bodies capped at 1 MB; error responses hide
stack traces in production; the API reads the client's real IP through `TRUST_PROXY` so rate limits cannot be dodged by
spoofing `X-Forwarded-For`.

## Rate limits

| Where | Limit | Counted per |
| --- | --- | --- |
| Whole API | 300 requests / 15 minutes (kiosk payment polling exempt) | IP |
| Cashier login | 10 wrong passwords / 15 minutes, all branches together (successful logins are not counted) | IP |
| Kiosk unlock | 10 wrong passwords / 15 minutes (own budget, separate from the cashier's) | IP |
| Kiosk orders and GCash retries | 30 / minute | Device |
| Change password | 10 attempts / 15 minutes | User |
| Start a guest chat | 5 / hour | IP |
| Guest chat messages | 20 / minute | IP |
| Guest chat photos | 10 / 10 minutes | IP |

Rate limiting is per server process (in memory). Behind several server instances each would count separately; use a
shared store if you scale out.

## Secrets

| Secret | Lives in | Never… |
| --- | --- | --- |
| Supabase **secret key** | `backend/.env` (server only) | in the frontend, in git, in logs |
| Supabase publishable key | `backend/.env`, `frontend/.env` | (public by design) |
| PayMongo secret and webhook secret | `backend/.env` | in the frontend or git |
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
| **High** | **Double payment** (GCash plus cash, or two cash requests at once) | Conditional updates, a one-cash-payment-per-order rule, and cancelling the earlier GCash attempt |
| **High** | **Tomorrow's first order could not be created.** Order numbers restart daily but were globally unique, so `K-0001` collided with yesterday's | Uniqueness is per number *per Manila day* |
| **High** | **Deactivated riders kept working** until their token expired | Checked on every rider request |
| **Medium** | The shared sign-in client kept the last user's session, so later "anonymous" reads ran as that user | A fresh client per sign-in |
| **Medium** | Google sign-in revoked its own session, so users were bounced to login at checkout | The OAuth client's state is deleted directly instead |
| **Medium** | Order search broke on commas and brackets and could add its own filter conditions | User text is escaped/quoted |
| **Medium** | Editing a product's sizes failed once ordered; an order could be edited after payment began; stale GCash attempts stayed live | Options are updated in place; edits blocked once payment starts; earlier attempts cancelled |
| **Medium** | Logout ended the user's sessions on **every** device, including all registers sharing the cashier login | Logout ends only that device's session |
| **Low** | A browser's *Back* from GCash left a frozen checkout; kiosk failure screens never reset; modals let keyboard focus escape | Fixed (see [changelog.md](./changelog.md)) |
| **Low** | With branch policies in place, an anonymous read of `orders` or chats failed with *permission denied for function has_branch_access* instead of returning nothing | The function is executable by `anon` (it answers false) and runs with the caller's rights rather than as a definer |

## Known gaps and accepted risks

| Gap | Impact | Mitigation / next step |
| --- | --- | --- |
| **Shared cashier login per branch** | Cash payments record *the branch's cashier account*, not the person on shift | Per-cashier accounts or a name prompt at shift start |
| **One branch per cashier login and rider** | A rider who covers two branches needs two accounts | Allow several rows in `branch_staff` for riders if that becomes common |
| **A kiosk's device key is extractable** by anyone with developer tools on that terminal | It is a revocable device identifier, not a true secret | Revoke devices from Admin → Kiosks; a locked-down kiosk shell would be stronger |
| **Logins are stored in the browser (`localStorage`)** | A cross-site-scripting bug anywhere would expose a session | React escapes output and the app renders no user HTML; add a Content-Security-Policy at the host (the frontend sets none) |
| **Leaked-password protection is off** in Supabase | Users may choose a password known from breaches | Turn it on: Authentication → Passwords |
| **Guests are anonymous** | Spam is limited only by rate limits and the 30-photo cap | Tighten limits, add a challenge, or require a name |
| **A chat photo link works for up to an hour** for anyone who is given it | A person in the conversation could share it | Short expiry; only conversation members receive links |
| **Chat photos outlive a deleted conversation** | Orphaned files remain in storage | A periodic clean-up (see [operations.md](./operations.md#maintenance)) |
| **Map lookups go to OpenStreetMap from the browser** | OSM sees the searched address and the pinned coordinates | Disclose it; self-host a geocoder if privacy requires |
| **Rate limits are per process** | Several server instances each count separately | A shared store (e.g. Redis) when scaling out |
| **GCash is untested against live PayMongo** | Behaviour with real money is unproven | Test in PayMongo's test mode before go-live ([deployment.md](./deployment.md#gcash-paymongo)) |
| **Orders have no duplicate protection** | A dropped connection plus a second tap can create two orders | An idempotency key on order creation |

## Before going live

- [ ] Change **every** development password: super admin, the Imus test admin, each branch's cashier and kiosk, the
      sample riders and customers. Delete the `@3k.local` test accounts. Keep [test-accounts.md](./test-accounts.md)
      out of public view, or delete it.
- [ ] Give each branch its real address, phone and opening hours (Admin → Branches); the seeds are 08:00–21:00 with
      no address.
- [ ] `NODE_ENV=production`, `CORS_ORIGIN` set to your site (not `*`), `TRUST_PROXY` matching your hosting, HTTPS everywhere.
- [ ] Supabase: enable leaked-password protection; confirm only your real site addresses are in the redirect URL list;
      decide whether email confirmation is required.
- [ ] Keep the GitHub repository **private** (it contains development credentials in the docs).
- [ ] Use PayMongo **live** keys only on the server, and set the webhook secret.
- [ ] Add a Content-Security-Policy and standard headers at your static host.
- [ ] Turn on database backups and confirm you can restore.
- [ ] Run `npm test` and `scripts/dev/check-rls.mjs` against a **separate** project, never production.

The full checklist, with configuration, is in [deployment.md](./deployment.md#go-live-checklist).

## Reporting a problem

Treat anything that lets someone see another person's data, act as another role, or change money as urgent. Note what
was done and what happened, fix it behind a test that fails first, add a row to *Issues found and fixed* above, and
record the change in [changelog.md](./changelog.md).
