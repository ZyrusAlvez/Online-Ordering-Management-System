# API Reference — Frontend Guide

Base URL: `http://localhost:4000/api/v1` (set by `API_PREFIX`).

Everything a frontend needs is here. Each of the five apps has its own path
prefix, so you only need to read your own section plus **Conventions** and
**Authentication**.

---

## Conventions

**Responses.** One shape, everywhere:

```jsonc
// single resource
{ "data": { ... } }

// list
{ "data": [ ... ], "meta": { "page": 1, "limit": 20, "total": 42, "pages": 3 } }

// error
{ "error": { "message": "Order not found", "details": { ... } } }
```

`details` is present on validation errors and maps field name → messages:

```json
{
  "error": {
    "message": "Invalid request body",
    "details": { "delivery_address": ["delivery_address is required when fulfillment_type is \"delivery\""] }
  }
}
```

Schema-level errors that belong to no single field appear under `details._errors`.

**Status codes.**

| Code | Meaning |
| --- | --- |
| `200` / `201` / `204` | Success |
| `400` | Validation failed, or the request is nonsensical (unknown product, variant on the wrong product) |
| `401` | Missing/invalid token or kiosk key |
| `403` | Authenticated but the wrong role, or asking for a branch you do not work at |
| `404` | Not found — or not visible to you (for example another branch's order), which is deliberately indistinguishable |
| `409` | Conflict: illegal state transition, already paid (or paid twice at once), already claimed, item unavailable or sold out at the branch, branch closed for an ASAP order, a product or option that appears in past orders can't be deleted/removed, chat closed, duplicate branch code |
| `429` | Rate limited |
| `503` | GCash requested but PayMongo is not configured |

**Field rules.** The same limits apply on every endpoint (and are repeated in the
forms and as database constraints). The full list, with the reason for each, is in
[the data dictionary](./data-dictionary.md#input-rules-the-same-everywhere).
The ones that most often trip a client up:

- **Phone numbers are exactly 11 digits starting `09`**, digits only (`09171234567`). No spaces, dashes or `+63`.
  This applies to `customer_phone` on orders, `phone` on profiles and on riders.
  A rider's `phone` may be `null` on update to clear it.
- Text is **trimmed**, so a name made only of spaces is rejected. Emails are lower-cased.
- Prices and amounts are pesos with **at most 2 decimals** and at most `999999.99`; quantity is a whole number `1`–`99`;
  an order has at most 50 different items.
- `delivery_address.latitude` / `longitude` (the map pin) are **optional but must come together**, inside the Philippines.

**Money.** `total_amount`, `price` and `unit_price` are pesos as JSON numbers
(`260`, `144.50`). The server computes every total from live menu prices — a
total sent by a client is ignored. Display prices from the API; never compute
the authoritative total yourself.

**IDs** are UUIDs. `order_number` (`K-0042`, `P-0013`, `O-0108`) is the short
human code — show that to customers and staff, but address the API by `id`.

---

## Authentication

Three mechanisms, depending on the app:

| App | Mechanism |
| --- | --- |
| Online, POS, Rider, Admin | `Authorization: Bearer <access_token>` |
| Kiosk | `X-Kiosk-Key: kiosk_...` |
| Public menu | none |

### Getting a token

```http
POST /auth/login
Content-Type: application/json

{ "email": "cashier@3k.local", "password": "..." }
```

```jsonc
{
  "user": { "id": "…", "email": "…", "app_metadata": { "role": "cashier" } },
  "session": { "access_token": "eyJ…", "refresh_token": "…", "expires_in": 3600 }
}
```

Read the role from `user.app_metadata.role` to decide what to render. **Never
trust it for security** — the server re-checks on every request.

Access tokens expire (1h by default). On `401`, call `POST /auth/refresh` with
`{ "refreshToken": "..." }` and retry once; if that also fails, send the user
back to login.

### Auth endpoints

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | `{ email, password, fullName? }` | Always creates a **customer**. Staff accounts cannot be self-registered. |
| `POST` | `/auth/login` | `{ email, password }` | |
| `POST` | `/auth/refresh` | `{ refreshToken }` | |
| `POST` | `/auth/logout` | — | Requires a token. `204`. |
| `GET` | `/auth/me` | — | Current user. |
| `GET` | `/auth/profile` | — | `{ data: { id, email, full_name, phone, default_address, role, sign_in_method: 'email'\|'google', can_change_password, avatar_url, branches } }`. `branches` is the branches a staff account works at (every branch for a super admin; `[]` for a customer); staff screens build their branch switcher from it. |
| `PATCH` | `/auth/profile` | `{ full_name?, phone?, default_address? }` | At least one field. `phone` and `default_address` accept `null` to clear. `default_address` has the same shape as an order's `delivery_address`. Sending `role` or `is_active` is a `400`. |
| `POST` | `/auth/password` | `{ current_password, new_password }` | `204`. A wrong current password is `400` (not `401`, which the frontend reads as an expired session). `400` for Google accounts, `403` for the shared cashier login. 10 attempts per 15 minutes. |

### Employee gates — `/employee`

`/cashier` and `/kiosk` in the frontend sit behind a shared employee password
per **branch** instead of a personal login. Both endpoints are limited to 10
wrong attempts per IP per 15 minutes (`429` after that). A wrong password, or a
branch with no password set, is always `401`.

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| `POST` | `/employee/cashier/login` | `{ branch_id, password }` | Returns `{ user, session }` exactly like `/auth/login`, for that branch's shared cashier account. Use the token on `/pos/*`; it only sees that branch. |
| `POST` | `/employee/kiosk/unlock` | `{ branch_id, password, device_name? }` | `201 { data: { id, name, key, branch } }`. Provisions a new kiosk device **bound to the branch** and returns its raw key once — store it and send it as `X-Kiosk-Key`. It appears in `/admin/kiosks` and can be revoked there. |

Admins change both passwords per branch with `PUT /admin/employee-passwords/:role`.

---

## Branches

```http
GET /branches
```

Public. The active branches, by name, for the map and every branch picker:

```jsonc
{
  "data": [
    {
      "id": "…", "code": "gma", "name": "GMA Terminal",
      "address": null, "phone": null,
      "latitude": 14.295601, "longitude": 120.999645,
      "opens_at": "08:00", "closes_at": "21:00",     // Manila time; both null = open 24 hours
      "is_active": true
    }
  ]
}
```

Every order, kiosk and website chat belongs to a branch. Staff lists accept
`?branch_id=` to narrow to one of the caller's branches (`403` for any other);
without it they cover all of the caller's branches.

> Supabase rate-limits signups per IP. In development you will hit `429` after
> a handful of registrations; create test users with the admin API instead
> (see [testing-manual.md](./testing-manual.md)).

---

## The menu (all ordering apps)

```http
GET /menu
GET /menu?include_unavailable=true     # POS/admin, to show sold-out items
GET /menu?branch_id=<id>               # as one branch sees it: its sold-out dishes hidden
```

With `branch_id`, a dish that branch has sold out is left out, or, with
`include_unavailable=true`, returned with `is_available: false`,
`sold_out_here: true` and `available_everywhere` (the super admin's own switch).

Categories → products → variants, pre-nested and pre-sorted by `sort_order`.
One call renders an entire menu screen:

```jsonc
{
  "data": [
    {
      "id": "d4c7e289-…",
      "name": "3K Ala Carte",
      "sort_order": 1,
      "products": [
        {
          "id": "635ec412-…",
          "name": "Lechon Kawali",
          "price": null,                  // ← priced on its variants
          "description": null,
          "image_url": null,
          "is_available": true,
          "customizations": [],
          "variants": [
            { "id": "b571713a-…", "label": "250g", "price": 145, "sort_order": 1 },
            { "id": "8bcbfc5f-…", "label": "500g", "price": 280, "sort_order": 2 }
          ]
        },
        {
          "id": "f466d453-…",
          "name": "Lumpiang Shanghai",
          "price": 150,
          "variants": [],                 // ← flat-priced
          "customizations": []
        }
      ]
    }
  ]
}
```

**Three product shapes you must handle:**

1. **Flat price** — `price` set, `variants: []`. Add to cart directly.
2. **Variant-priced** — `price: null`, `variants` non-empty. The customer
   **must** pick a variant; send its `variant_id`. All Bilao trays and Lechon
   Kawali work this way.
3. **Unpriced** — `price: null` and either no variants or variants with
   `price: null` (currently the three Softdrinks sizes). The API rejects these
   with `409 Price not yet set`. Render them as unavailable.

`customizations` (e.g. Egg → `["Fried", "Boiled"]`) are free choices with no
price effect. Pass the customer's pick in the line's `notes`.

`GET /categories`, `GET /products` (`?page&limit&search&category_id&available`)
and `GET /products/:id` remain available for admin screens that need paging.

---

## Carts and order items

There is no server-side cart. Build it client-side and POST the whole order.
Every ordering endpoint takes the same `items` array:

```jsonc
"items": [
  { "product_id": "635ec412-…", "variant_id": "8bcbfc5f-…", "quantity": 2 },
  { "product_id": "f466d453-…", "quantity": 1, "notes": "extra egg" }
]
```

`variant_id` is required when the product is variant-priced and must belong to
that product, or you get `400`.

---

## 1. Kiosk — `/kiosk`

Header on every request: `X-Kiosk-Key: kiosk_...` (issued by an admin, or by
unlocking with the branch's kiosk password). The key belongs to one branch:
every order goes there. Rate limit: 30 orders/minute per device.

`GET /kiosk/me` returns `{ id, name, branch: { id, code, name } }` for the attract
screen and for `GET /menu?branch_id=` (the branch's sold-out dishes).

### Place an order

```http
POST /kiosk/orders
X-Kiosk-Key: kiosk_…

{
  "fulfillment_type": "dine_in",        // or "take_out"
  "customer_name": "Ana Reyes",         // how the cashier finds it
  "payment_method": "cash",             // or "gcash"
  "items": [ … ],
  "notes": "no onions"
}
```

```jsonc
{
  "data": {
    "order": { "id": "…", "order_number": "K-0042", "status": "pending",
               "payment_status": "unpaid", "total_amount": 330, "order_items": [ … ] },
    "payment": null
  }
}
```

**Cash** → `payment` is `null`. Show the order number and tell the customer to
pay at the counter.

**GCash** → `payment` is populated:

```json
{ "intent_id": "pi_…", "checkout_url": "https://…", "amount": 330 }
```

Send the customer to `checkout_url` (redirect, or render it as a QR). Then poll:

```http
GET /kiosk/orders/:id
```

until `payment_status` becomes `paid` (the order also flips to `confirmed`
automatically and goes straight to the kitchen) or `failed`. Poll every ~2s and
give up after a couple of minutes.

> A kiosk cannot use Supabase Realtime — it has no signed-in user, so row-level
> security would return it nothing. Polling this endpoint is the intended path.

If the customer abandons payment, `POST /kiosk/orders/:id/payment` starts a
fresh attempt and returns a new `checkout_url`.

Orders are scoped to the device that created them: another kiosk's order
returns `404`.

---

## 2. POS (cashier) — `/pos`

Role: `cashier`, `admin` or `super_admin`, limited to the caller's branches: a
cashier sees only their branch; an order of another branch is `404` on every
`/pos/orders/:id` route.

### The queue

```http
GET /pos/orders?status=pending&channel=kiosk
GET /pos/orders?q=Ana              # by customer name OR order number
```

Filters: `branch_id`, `status`, `payment_status`, `channel`, `q`, `page`, `limit`.
Each order carries `branch` (`{ id, code, name }`) and `scheduled_for` (an ISO
time, or `null` for as soon as possible); show scheduled ones prominently and
sort by `scheduled_for ?? created_at`.
`q` is how you "fetch" a kiosk order — the customer quotes their name or code.

### Working an order

| Action | Request |
| --- | --- |
| Ring up a walk-in | `POST /pos/orders` — `{ branch_id?, fulfillment_type, customer_name, payment_method, items[] }`. `branch_id` may be left out by someone with one branch (a cashier); an admin of several must send it (`400` otherwise) |
| Modify items | `PATCH /pos/orders/:id/items` — `{ items: [ … ] }` (replaces all; recomputes total) |
| Accept | `POST /pos/orders/:id/confirm` |
| Advance | `PATCH /pos/orders/:id/status` — `{ "status": "preparing" }` |
| Take cash | `POST /pos/orders/:id/payment/cash` — `{ "tendered_amount": 500 }` |
| Take GCash | `POST /pos/orders/:id/payment/gcash` |
| Void | `POST /pos/orders/:id/void` — `{ "reason": "customer changed mind" }` |

Cash payment returns the change to pop on screen:

```json
{ "data": { … }, "meta": { "tendered": 500, "change": 170 } }
```

**Legal transitions** (anything else is `409`, with the allowed set in the message):

| From | To |
| --- | --- |
| `pending` | `confirmed`, `preparing` |
| `confirmed` | `preparing`, `ready` |
| `preparing` | `ready` |
| `ready` | `completed` |
| `out_for_delivery` | `completed` |

Modifying items only works while `pending` or `confirmed`. Voiding works any
time before `completed`; voiding a paid GCash order auto-refunds and returns
`meta.refund_id`.

---

## 3. Online app — `/orders`

Role: any signed-in customer. Reads are row-level-security scoped, so a
customer only ever sees their own orders.

### Place an order

```http
POST /orders

{
  "branch_id": "…",                     // REQUIRED: the branch to order from (must be active)
  "scheduled_for": "2026-10-11T00:15:00Z", // optional: omit for as soon as possible
  "fulfillment_type": "delivery",       // or "pickup"
  "payment_method": "gcash",            // or "cash" (COD / pay at pickup)
  "customer_phone": "09171234567",      // 11 digits starting 09; REQUIRED when delivery
  "delivery_address": {                 // REQUIRED when delivery
    "line1": "123 Rizal St",
    "barangay": "Poblacion",
    "city": "Davao City",
    "landmark": "beside the pharmacy",
    "notes": "gate is blue",
    "latitude": 14.2985,                // optional map pin: both or neither
    "longitude": 120.997
  },
  "items": [ … ],
  "notes": "Ring the bell"
}
```

Response (`201`) — the full order:

```jsonc
{
  "data": {
    "id": "712483fb-…",
    "order_number": "O-0001",
    "channel": "online",
    "fulfillment_type": "delivery",
    "status": "pending",
    "payment_status": "unpaid",
    "payment_method": "gcash",
    "total_amount": 260,
    "customer_name": "Juan Dela Cruz",
    "delivery_address": { "line1": "9 Mabini St", "city": "Davao City" },
    "rider_id": null,
    "claimed_at": null,
    "delivered_at": null,
    "order_items": [
      {
        "id": "939903ef-…",
        "quantity": 2,
        "unit_price": 130,
        "notes": null,
        "product": { "id": "f79d519f-…", "name": "Sizzling Sisig", "price": 130 },
        "variant": null
      }
    ]
  }
}
```

**Branch and time.** `branch_id` must be an active branch (`400` otherwise). An
order without `scheduled_for` is for as soon as possible and is refused with
`409` (`details.scheduled_for`) while the branch is closed. `scheduled_for` must
be on a 15-minute mark, at least 30 minutes ahead, no later than the day after
tomorrow (Manila), and inside the branch's opening hours (`400` with
`details.scheduled_for` otherwise). A dish sold out at the branch is `409`. The
response carries `branch_id`, `branch` and `scheduled_for`.

For GCash, follow with `POST /orders/:id/payment` to get a `checkout_url`
(also used to retry a failed attempt).

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/orders?page&limit&status` | The caller's own orders |
| `GET` | `/orders/:id` | |
| `POST` | `/orders/:id/payment` | Start/retry GCash |
| `POST` | `/orders/:id/cancel` | Only while `pending`/`confirmed` **and** unpaid — otherwise `409`. A paid order must be voided by staff (refund path). |

---

## 4. Rider — `/rider`

Role: `rider`. Accounts are created by an admin.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/rider/pool` | Unclaimed `ready` delivery orders **of the rider's branch** |
| `POST` | `/rider/orders/:id/claim` | First rider wins; the loser gets `409` (so does a rider of another branch) |
| `POST` | `/rider/orders/:id/unclaim` | Back to the pool |
| `GET` | `/rider/orders?active=true` | Current deliveries (`false` → history) |
| `POST` | `/rider/orders/:id/delivered` | `{ "collected_amount": 260 }` |

`collected_amount` is **required** when `payment_status` is not already `paid`
(cash on delivery) and must be at least `total_amount`, else `400`. It settles
the payment and completes the order in one step.

Claiming is genuinely racy — always handle `409` by refreshing the pool rather
than assuming your claim succeeded.

---

## 5. Admin — `/admin`

Role: `admin`.

| Method | Path | Notes |
| --- | --- | --- |
Two roles reach `/admin`: **`admin`**, limited to the branches assigned to them,
and **`super_admin`**, every branch plus what they share (marked **super** below;
`403` for an admin). Lists cover the caller's branches and accept `?branch_id=`
to narrow to one (`403` for a branch outside them); records of other branches
are `404`. A deactivated admin is `403` on every route.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/admin/orders` | Orders of the caller's branches. `?branch_id&status&payment_status&channel&from&to&page&limit` (`from`/`to` are ISO 8601) |
| `POST` | `/admin/orders/:id/refund/retry` | Retry a refund PayMongo rejected |
| `GET` | `/admin/sales` | Sales report for a range of **Manila days**: `?from=YYYY-MM-DD&to=YYYY-MM-DD&branch_id` (both included; default is the last 7 days ending today, at most 366 days). See [Sales report](#sales-report). |
| `GET` | `/admin/riders` | `?branch_id&page&limit`. Each rider has `branches` |
| `POST` | `/admin/riders` | `{ branch_id, email, password (8–72), full_name, phone? }` |
| `PATCH` | `/admin/riders/:id` | `{ is_active?, full_name?, phone?, branch_id? }` (`branch_id` moves the rider to another of the caller's branches) |
| `GET` | `/admin/kiosks` | `?branch_id`. Devices with their `branch`; never returns key hashes |
| `POST` | `/admin/kiosks` | `{ name, branch_id }` |
| `DELETE` | `/admin/kiosks/:id` | Revoke (`204`) |
| `PUT` | `/admin/employee-passwords/:role` | `{ branch_id, password }` (min 6). `:role` is `cashier` or `kiosk`. `204`. Changing the cashier password also changes that branch's register login; the first time, it **creates** the branch's cashier account (`cashier.<code>@…`). Kiosk browsers that already unlocked keep working; revoke their devices to force a re-unlock. |
| `PUT` / `DELETE` | `/admin/branches/:id/sold-out/:productId` | Mark a dish sold out at that branch / available again (`204`). Any admin of the branch |
| `GET` | `/admin/branches` | **super.** Every branch, including closed ones |
| `POST` | `/admin/branches` | **super.** `{ name, code, latitude, longitude, address?, phone?, opens_at?, closes_at?, is_active? }`. `code` is 2–30 of `a-z 0-9 -`, unique (`409`). Hours are `HH:MM`, both or neither (neither = open 24 hours), closing after opening |
| `PATCH` | `/admin/branches/:id` | **super.** Any of the above except `code`. There is no delete: set `is_active: false` |
| `GET` | `/admin/admins` | **super.** Admin and super admin accounts with their `branches` |
| `POST` | `/admin/admins` | **super.** `{ email, password, full_name, phone?, branch_ids: [≥1] }`. Refuses (`409`) the email of a super admin |
| `PATCH` | `/admin/admins/:id` | **super.** `{ branch_ids?, is_active?, full_name? }`. Branch admins only (`404` for a super admin). Takes effect on their next request |
| `PATCH` | `/admin/users/:id/role` | **super.** `{ role }` (`customer`, `cashier`, `rider`, `admin`, `super_admin`) |

### Sales report

`GET /admin/sales?from=2026-10-01&to=2026-10-07` returns:

```jsonc
{
  "data": {
    "range": { "from": "2026-10-01", "to": "2026-10-07" },
    "totals": { "orders": 42, "revenue": 18350, "average_order": 436.9, "items_sold": 97 },
    "daily": [ { "date": "2026-10-01", "orders": 6, "revenue": 2450 }, … ],   // every day, zeros included
    "by_method": [ { "method": "cash", "orders": 30, "revenue": 12100 }, { "method": "gcash", … } ],
    "by_channel": [ { "channel": "pos", "orders": 20, "revenue": 8200 }, { "channel": "online" … }, { "channel": "kiosk" … } ],
    "by_branch": [ { "branch_id": "…", "name": "GMA Terminal", "orders": 30, "revenue": 12400 }, … ],   // within the report's branches
    "top_items": [ { "product_id": "…", "name": "Sizzling Sisig", "variant": null, "quantity": 18, "revenue": 2340 }, … ],   // top 10
    "refunds_pending": { "orders": 1, "amount": 350 }
  }
}
```

A **sale** is an order that has been **paid** and has **not been voided or cancelled**, counted on the Manila
day it was **placed** (so a 9pm order is today's). It is counted when it is paid, not when it is completed:
a kiosk GCash or counter cash order is paid long before the kitchen finishes it. Voided and refunded orders
drop out; voided orders still waiting on a GCash refund are shown in `refunds_pending` and are **not**
revenue. Money is pesos. `400` for a reversed range, more than 366 days, or a date that is not real
(`2026-02-30`). The report covers the caller's branches, or the one in `branch_id`.

Issuing a kiosk key returns the raw key **once**:

```json
{
  "data": {
    "id": "…", "name": "Lobby Kiosk 1", "key_prefix": "kiosk_3wB52ff",
    "key": "kiosk_3wB52ffu…",
    "warning": "Copy this key now — it cannot be retrieved again."
  }
}
```

Show it in a copyable field and make clear it will not be shown again. Only the
hash is stored; a lost key means issuing a new device.

Menu management uses `POST`/`PATCH`/`DELETE` on `/categories` and `/products`
(**super admin only**: one menu and price list for every branch). Sending
`variants` on a product **replaces the entire variant list**. A branch's own
"sold out" is `PUT`/`DELETE /admin/branches/:id/sold-out/:productId`.

### Images

Images live in the public Supabase Storage bucket `menu-images`; browsers never
write to it. Send the file as the **raw request body** (not multipart) with
`Content-Type: image/jpeg`, `image/png` or `image/webp`, max 5 MB. The bytes are
checked, not just the header.

| Method | Path | Notes |
| --- | --- | --- |
| `PUT` | `/products/:id/image` | Super admin. Stores the file, sets `image_url`, deletes the previous upload. Returns `{ data: product }`. |
| `DELETE` | `/products/:id/image` | Super admin. Clears `image_url` and deletes the stored file. |
| `PUT` | `/admin/site-images/:key` | Super admin. `key` is `logo` (the only site image; anything else is `400`). Returns `{ data: { logo } }`. |
| `DELETE` | `/admin/site-images/:key` | Super admin. Back to the bundled default (`null`). |
| `GET` | `/site/images` | Public. `{ data: { logo } }`; `null` means use the bundled `/brand/logo.jpg`. |

`image_url` on `PATCH /products/:id` also accepts an external URL, or `null` to
clear it. Seed the logo from `frontend/public/brand` with
`npm run seed:brand`.

---

## Chat

Two kinds of conversation, one message shape
`{ id, thread_id, sender_role: visitor|customer|cashier|rider, body, image_url, created_at }`.
A text message has a `body` of 1–1000 characters and `image_url: null`; a **photo** message has `body: ""`
and a temporary `image_url`. `sender_id` is never returned.

**Photos.** Send the picture as the **raw request body** (not multipart) to the `…/images` route of the
conversation, with `Content-Type: image/jpeg`, `image/png` or `image/webp`, at most **5 MB** (`413` above that).
The bytes are checked, so a mislabelled file is `400`. Each conversation holds at most **30 photos** (`409`
after that). They are stored in a **private** bucket and shown through links that expire after an hour, so
refetch the messages to renew them; the storage path is never exposed. The clients shrink photos in the browser
first. A guest can send a photo only after their first text message (the thread must exist).

**Support — anyone on the landing page, no account.** Talks to the cashier of the branch they pick.

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/chat/visitor/threads` | `{ branch_id, body, name? }` (an active branch). `201 { data: { thread_id, token, messages } }`. Keep both in localStorage: the `token` is shown once and only its hash is stored. Max 5 per hour per IP. |
| `GET` | `/chat/visitor/threads/:id/messages` | Header `X-Chat-Token`. `401` for a missing/wrong token or unknown thread (indistinguishable). |
| `POST` | `/chat/visitor/threads/:id/messages` | `{ body }` with `X-Chat-Token`. Max 20 per minute. |
| `POST` | `/chat/visitor/threads/:id/images` | Raw image with `X-Chat-Token` → `201 { data: message }`. Max 10 photos per 10 minutes. |
| `GET` | `/pos/chat/threads` | Cashier/admin inbox for their branches (`?branch_id` for one), newest first: `{ id, branch_id, branch, guest_number, display_name, visitor_name, last_message, last_sender_role, last_message_at, unread }`. Another branch's thread is `404` on the routes below. `display_name` is `Guest-1023`, or `Maria (Guest-1023)` when the visitor gave a name. |
| `GET` / `POST` | `/pos/chat/threads/:id/messages` | Read history / reply (`{ body }`). |
| `POST` | `/pos/chat/threads/:id/images` | Reply with a photo (raw image). |
| `POST` | `/pos/chat/threads/:id/read` | `204`. Clears `unread`. |

**Delivery — online customer ↔ the rider holding the order.**

| Method | Path | Notes |
| --- | --- | --- |
| `GET` / `POST` | `/orders/:id/chat` | The customer who placed it. |
| `GET` / `POST` | `/rider/orders/:id/chat` | The rider currently holding it. |
| `POST` | `/orders/:id/chat/images`, `/rider/orders/:id/chat/images` | A photo from the customer / the rider (raw image). Same rules as text: `409` when the chat is closed. |

`GET` returns `{ thread_id, open, order, with: { role, name }, messages }`.
`open` is true only while the order is `out_for_delivery` with a rider; `thread_id` is
`null` until a rider takes it. `POST` is `409` when closed; history stays readable
afterwards. Anyone else gets `404`. If a rider releases the order the thread stays with
the order, so the next rider sees the earlier messages.

**Live updates.** Logged-in users subscribe to `postgres_changes` on `chat_messages`
(`thread_id=eq.<id>`); the cashier inbox also subscribes to `chat_threads`. RLS scopes
each role to its own conversations. Visitors have no JWT, so they subscribe to the
Broadcast channel `chat:<thread_id>` instead. Its `message` event is only a ping
(`{ thread_id }`, no text): refetch the messages over the API. Poll every ~20 s as a
fallback.

---

## Live updates (POS, rider, online)

Do **not** poll `/pos/orders` on a timer. Subscribe to Postgres changes with
the Supabase client using the **publishable** key and the user's access token.
Row-level security scopes the stream automatically — a cashier receives every
order of their branch, an admin those of their branches (a super admin all), a
rider their branch's pool plus their own deliveries, a customer only theirs.

```js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
await supabase.auth.setSession({ access_token, refresh_token });

const channel = supabase
  .channel('orders')
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'orders' },
      (payload) => {
        // payload.eventType: INSERT | UPDATE | DELETE
        // payload.new holds the order row (no joined items — refetch if needed)
        refreshQueue(payload.new);
      })
  .subscribe();

// on unmount
supabase.removeChannel(channel);
```

The payload carries the `orders` row only, without `order_items`. For a queue
list that is usually enough; fetch the full order via the REST API when the
cashier opens it.

Use the API for **writes** and Realtime for **notifications** — never write to
Supabase directly from a frontend, or you bypass all the pricing and transition
rules.

---

## Cheat sheet

| I want to… | Call |
| --- | --- |
| Show the branches on a map | `GET /branches` |
| Render a menu | `GET /menu?branch_id=<the customer's branch>` |
| Place a kiosk order | `POST /kiosk/orders` |
| Find a customer's order at the till | `GET /pos/orders?q=<name or number>` |
| Take payment | `POST /pos/orders/:id/payment/cash` |
| Send to kitchen | `POST /pos/orders/:id/confirm` then `PATCH …/status` |
| Order for delivery | `POST /orders` with `branch_id` and `fulfillment_type: "delivery"` |
| Order for later | `POST /orders` with `scheduled_for` (15-minute slot within the branch's hours) |
| Find deliveries to take | `GET /rider/pool` |
| Finish a delivery | `POST /rider/orders/:id/delivered` |
| Add a kiosk terminal | `POST /admin/kiosks` with `branch_id` |
| Add or edit a branch | `POST` / `PATCH /admin/branches` (super admin) |
| Give an admin their branches | `POST /admin/admins`, `PATCH /admin/admins/:id` (super admin) |
| Mark a dish sold out at a branch | `PUT /admin/branches/:id/sold-out/:productId` |
| Watch the queue live | Supabase Realtime on `orders` |
| Sign in as the cashier / unlock a kiosk | `POST /employee/cashier/login` / `POST /employee/kiosk/unlock` |
| Read or edit my profile, change password | `GET` / `PATCH /auth/profile`, `POST /auth/password` |
| Pin a delivery address on the map | `delivery_address.latitude` and `.longitude` on `POST /orders` (optional, together) |
| Start a guest chat, then reply | `POST /chat/visitor/threads`, then `POST …/messages` with `X-Chat-Token` |
| Read the cashier's chat inbox | `GET /pos/chat/threads`, then `GET …/:id/messages` |
| Chat on a delivery | `GET` / `POST /orders/:id/chat` (customer), `/rider/orders/:id/chat` (rider) |
| Send a photo in a chat | `POST` the raw image to the conversation's `…/images` route |
| Upload a dish photo | `PUT /products/:id/image` (raw image); remove with `DELETE` |
| Replace the logo | `PUT /admin/site-images/logo` |
| Get sales figures | `GET /admin/sales?from=YYYY-MM-DD&to=YYYY-MM-DD` |
| Change a branch's cashier or kiosk password | `PUT /admin/employee-passwords/:role` with `branch_id` |
