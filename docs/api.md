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
| `403` | Authenticated but the wrong role |
| `404` | Not found — or not visible to you, which is deliberately indistinguishable |
| `409` | Conflict: illegal state transition, already paid (or paid twice at once), already claimed, item unavailable, a product or option that appears in past orders can't be deleted/removed, chat closed |
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
| `GET` | `/auth/profile` | — | `{ data: { id, email, full_name, phone, default_address, role, sign_in_method: 'email'\|'google', can_change_password, avatar_url } }`. |
| `PATCH` | `/auth/profile` | `{ full_name?, phone?, default_address? }` | At least one field. `phone` and `default_address` accept `null` to clear. `default_address` has the same shape as an order's `delivery_address`. Sending `role` or `is_active` is a `400`. |
| `POST` | `/auth/password` | `{ current_password, new_password }` | `204`. A wrong current password is `400` (not `401`, which the frontend reads as an expired session). `400` for Google accounts, `403` for the shared cashier login. 10 attempts per 15 minutes. |

### Employee gates — `/employee`

`/cashier` and `/kiosk` in the frontend sit behind a shared employee password
instead of a personal login. Both endpoints are limited to 10 attempts per IP
per 15 minutes (`429` after that). A wrong password is always `401`.

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| `POST` | `/employee/cashier/login` | `{ password }` | Returns `{ user, session }` exactly like `/auth/login`, for the shared cashier account (`CASHIER_EMAIL`). Use the token on `/pos/*`. |
| `POST` | `/employee/kiosk/unlock` | `{ password, device_name? }` | `201 { data: { id, name, key } }`. Provisions a new kiosk device and returns its raw key once — store it and send it as `X-Kiosk-Key`. It appears in `/admin/kiosks` and can be revoked there. |

Admins change both passwords with `PUT /admin/employee-passwords/:role`.

> Supabase rate-limits signups per IP. In development you will hit `429` after
> a handful of registrations; create test users with the admin API instead
> (see [testing-manual.md](./testing-manual.md)).

---

## The menu (all ordering apps)

```http
GET /menu
GET /menu?include_unavailable=true     # POS/admin, to show sold-out items
```

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

Header on every request: `X-Kiosk-Key: kiosk_...` (issued by an admin).
Rate limit: 30 orders/minute per device.

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

Role: `cashier` or `admin`.

### The queue

```http
GET /pos/orders?status=pending&channel=kiosk
GET /pos/orders?q=Ana              # by customer name OR order number
```

Filters: `status`, `payment_status`, `channel`, `q`, `page`, `limit`.
`q` is how you "fetch" a kiosk order — the customer quotes their name or code.

### Working an order

| Action | Request |
| --- | --- |
| Ring up a walk-in | `POST /pos/orders` — `{ fulfillment_type, customer_name, payment_method, items[] }` |
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
| `GET` | `/rider/pool` | Unclaimed `ready` delivery orders |
| `POST` | `/rider/orders/:id/claim` | First rider wins; the loser gets `409` |
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
| `GET` | `/admin/orders` | All orders. `?status&payment_status&channel&from&to&page&limit` (`from`/`to` are ISO 8601) |
| `POST` | `/admin/orders/:id/refund/retry` | Retry a refund PayMongo rejected |
| `GET` | `/admin/sales` | Sales report for a range of **Manila days**: `?from=YYYY-MM-DD&to=YYYY-MM-DD` (both included; default is the last 7 days ending today, at most 366 days). See [Sales report](#sales-report). |
| `GET` | `/admin/riders` | |
| `POST` | `/admin/riders` | `{ email, password (8–72), full_name, phone? }` |
| `PATCH` | `/admin/riders/:id` | `{ is_active?, full_name?, phone? }` |
| `GET` | `/admin/kiosks` | Devices; never returns key hashes |
| `POST` | `/admin/kiosks` | `{ name }` |
| `DELETE` | `/admin/kiosks/:id` | Revoke (`204`) |
| `PUT` | `/admin/employee-passwords/:role` | `{ password }` (min 6). `:role` is `cashier` or `kiosk`. `204`. Changing the cashier password also changes that account's login. Kiosk browsers that already unlocked keep working; revoke their devices to force a re-unlock. |
| `PATCH` | `/admin/users/:id/role` | `{ role }` |

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
(`2026-02-30`).

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

Menu management uses `POST`/`PATCH`/`DELETE` on `/categories` and `/products`.
Sending `variants` on a product **replaces the entire variant list**.

### Images

Images live in the public Supabase Storage bucket `menu-images`; browsers never
write to it. Send the file as the **raw request body** (not multipart) with
`Content-Type: image/jpeg`, `image/png` or `image/webp`, max 5 MB. The bytes are
checked, not just the header.

| Method | Path | Notes |
| --- | --- | --- |
| `PUT` | `/products/:id/image` | Admin or cashier. Stores the file, sets `image_url`, deletes the previous upload. Returns `{ data: product }`. |
| `DELETE` | `/products/:id/image` | Admin or cashier. Clears `image_url` and deletes the stored file. |
| `PUT` | `/admin/site-images/:key` | `key` is `logo` or `promo`. Returns `{ data: { logo, promo } }`. |
| `DELETE` | `/admin/site-images/:key` | Back to the bundled default (`null`). |
| `GET` | `/site/images` | Public. `{ data: { logo, promo } }`; `null` means use the bundled `/brand/*.jpg`. |

`image_url` on `PATCH /products/:id` also accepts an external URL, or `null` to
clear it. Seed the logo and promo from `frontend/public/brand` with
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

**Support — anyone on the landing page, no account.** Talks to the cashier.

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/chat/visitor/threads` | `{ body, name? }`. `201 { data: { thread_id, token, messages } }`. Keep both in localStorage: the `token` is shown once and only its hash is stored. Max 5 per hour per IP. |
| `GET` | `/chat/visitor/threads/:id/messages` | Header `X-Chat-Token`. `401` for a missing/wrong token or unknown thread (indistinguishable). |
| `POST` | `/chat/visitor/threads/:id/messages` | `{ body }` with `X-Chat-Token`. Max 20 per minute. |
| `POST` | `/chat/visitor/threads/:id/images` | Raw image with `X-Chat-Token` → `201 { data: message }`. Max 10 photos per 10 minutes. |
| `GET` | `/pos/chat/threads` | Cashier/admin inbox, newest first: `{ id, guest_number, display_name, visitor_name, last_message, last_sender_role, last_message_at, unread }`. `display_name` is `Guest-1023`, or `Maria (Guest-1023)` when the visitor gave a name. |
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
order, a rider receives the pool plus their own, a customer receives only
theirs.

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
| Render a menu | `GET /menu` |
| Place a kiosk order | `POST /kiosk/orders` |
| Find a customer's order at the till | `GET /pos/orders?q=<name or number>` |
| Take payment | `POST /pos/orders/:id/payment/cash` |
| Send to kitchen | `POST /pos/orders/:id/confirm` then `PATCH …/status` |
| Order for delivery | `POST /orders` with `fulfillment_type: "delivery"` |
| Find deliveries to take | `GET /rider/pool` |
| Finish a delivery | `POST /rider/orders/:id/delivered` |
| Add a kiosk terminal | `POST /admin/kiosks` |
| Watch the queue live | Supabase Realtime on `orders` |
| Sign in as the cashier / unlock a kiosk | `POST /employee/cashier/login` / `POST /employee/kiosk/unlock` |
| Read or edit my profile, change password | `GET` / `PATCH /auth/profile`, `POST /auth/password` |
| Pin a delivery address on the map | `delivery_address.latitude` and `.longitude` on `POST /orders` (optional, together) |
| Start a guest chat, then reply | `POST /chat/visitor/threads`, then `POST …/messages` with `X-Chat-Token` |
| Read the cashier's chat inbox | `GET /pos/chat/threads`, then `GET …/:id/messages` |
| Chat on a delivery | `GET` / `POST /orders/:id/chat` (customer), `/rider/orders/:id/chat` (rider) |
| Send a photo in a chat | `POST` the raw image to the conversation's `…/images` route |
| Upload a dish photo | `PUT /products/:id/image` (raw image); remove with `DELETE` |
| Replace the logo or promo | `PUT /admin/site-images/:key` (`logo` or `promo`) |
| Get sales figures | `GET /admin/sales?from=YYYY-MM-DD&to=YYYY-MM-DD` |
| Change the cashier or kiosk password | `PUT /admin/employee-passwords/:role` |
