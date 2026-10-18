# How it works

What the system does, the rules behind each screen, and how each person uses it. This is the place to settle "bug
or intended?". Field limits are in [database.md](./database.md); where each rule lives in code, in
[architecture.md](./architecture.md).

## Who uses it

| Who | Screen | Signs in with |
| --- | --- | --- |
| Visitor | `/` landing (branch map, menu, chat) | Nothing until checkout |
| Customer | `/menu`, `/checkout`, `/orders`, `/profile` | Email + password, or Google |
| Cashier | `/cashier` point of sale | Branch + that branch's shared password |
| Kiosk | `/kiosk` self-order terminal | Branch + kiosk password, once per browser |
| Rider | `/driver` | Email + password |
| Admin | `/admin`, their branches only | Email + password |
| Super admin | `/admin`, every branch | Email + password |

## Branches

Seven branches in Cavite (GMA Terminal, Dasma Bayan, Langkaan, Gen-Tri, Trece, Silang, Imus). **Every order, kiosk,
website chat, cashier login and rider belongs to one branch.** The menu and prices are shared and edited by the super
admin; each branch can only mark a dish **sold out** for itself.

- A branch has a name, a code (used in `cashier.<code>@3k.local`), address, phone, map pin and opening hours in Manila
  time (none = 24 hours). It is never deleted: unticking **Open for orders** hides it and refuses new orders and chats.
- **Online orders** go to the branch the customer picks; until they pick, the **nearest** (if location is allowed),
  else the first. A pick is remembered in the browser and always wins. **Kiosk** orders go to the kiosk's branch,
  **counter** orders to the register's.
- **Admins** see only their assigned branches (one or several; another branch's orders answer 404, its lists 403).
  Cashiers and riders see only their branch. Access is read from the database on every request, and the same rule
  scopes live updates.

## Orders

| | Kiosk | Counter | Online |
| --- | --- | --- | --- |
| Placed by | The customer at a terminal | The cashier | A logged-in customer |
| Fulfilment | Dine in, take out | Dine in, take out | Delivery, pickup |
| Number | `K-0042` | `P-0013` | `O-0108` |

- **Numbers** restart every Manila day and are counted per branch.
- **Prices** always come from the live menu (the browser only says what and how many) and are saved on each line, so
  menu changes never rewrite history. Sold-out, unknown or unpriced dishes are refused. 1–99 per line, at most 50
  dishes per order.
- **Lifecycle:** `pending → confirmed → preparing → ready → completed`; a delivery goes `ready → out_for_delivery`
  (rider) `→ completed`. "Send to kitchen" = confirm + preparing. No skipping or going back (409). A completed order
  can't be voided. **Edit items** only while pending/confirmed and before any payment starts.

| | Cancel | Void |
| --- | --- | --- |
| Who | The customer | Cashier or admin of the branch |
| When | Pending or confirmed, and unpaid | Any open order, except while GCash proof waits for verification |
| Needs | Nothing | A reason (recorded with who and when) |

### Scheduled orders (online only)

As soon as possible **only while the branch is open**; otherwise a **15-minute slot**, at least **30 minutes** ahead, up
to the end of the **day after tomorrow**, inside the branch's hours. Checkout offers only valid slots; the database
checks again. In the cashier's queue a scheduled order has an **amber edge and clock badge**, turns **orange with a
countdown** in the last hour, sorts by its time, and says to start preparing 30 minutes before. A **Scheduled** filter
shows only those.

## Payments

Payment status is separate from order status (orders are often paid before they're done, or done before they're paid).

```
unpaid ─(customer sends GCash ref/receipt)─▶ processing ─(staff approve)─▶ paid
                                                 └─(staff reject + reason)─▶ failed ─(send again)─▶ processing
unpaid ─(cash taken, or GCash receipt checked at the counter)─▶ paid
paid ─(void a GCash order)─▶ refund_pending ─(money sent back, admin marks it)─▶ refunded
```

- **Cash:** at the counter the cashier types what was handed over and sees the change (less than the total is
  refused). On delivery the rider records the cash collected. Each cash payment is recorded once, with who took it.
- **GCash is manual:** customers pay the restaurant's own account (QR, name, number from settings). Online, they send the
  reference number and/or a receipt screenshot; the order is **Awaiting verification** until staff approve or reject it.
  At the kiosk the QR is shown with the order number and the customer shows the receipt at the counter, where the cashier
  types its reference number. No GCash settings = cash only.
- Protected against double charges: one waiting proof at a time; a cash payment replaces waiting proof; no voiding
  while proof waits; a voided paid GCash order becomes **refund pending** until an admin marks it **refunded**.

## Delivery

The cashier takes a delivery order to **Mark ready**; it then appears in **Available** for every rider of that branch.
**First to claim wins** (the other gets "already taken"). The rider can **Release** it or **Mark delivered**, entering
the cash collected for cash on delivery. The address is typed text plus an optional **map pin**, which gives everyone an
**Open in Maps** link. A deactivated rider is stopped on their next request.

## Kiosk

Unlocked once per browser with branch + password, which gives it its own revocable **device key** (only the hash is
stored). The customer taps **Touch to order** → Dine in / Take out → dishes → name → Cash (pay at counter) or GCash
(scan the QR) → order number. It resets after 3 minutes idle and shortly after showing a number. Staff lock it by tapping
the logo 5 times, or revoke it in Admin → Kiosks.

## Chat and photos

| | Website chat | Delivery chat |
| --- | --- | --- |
| Between | Anyone ↔ the cashier of the branch they pick | Customer ↔ the rider holding their order |
| Account | Not needed | Needed |
| Open | Always | Only while out for delivery; readable afterwards |

- A guest's first message returns a **secret token** the browser keeps (only its hash is stored). Staff see guests as
  `Guest-1023` or `Maria (Guest-1023)`.
- Live: signed-in people get database updates scoped by RLS; guests get a content-free ping, then fetch with their token.
  Everything also refreshes every 20 seconds.
- **Photos:** JPEG/PNG/WebP up to 5 MB (shrunk in the browser first), 30 per conversation, guests only after their first
  message. Stored privately and shown through links that expire after an hour.
- Menu photos and the logo are public (`menu-images`), served resized to the size shown.

## Sales

> A sale is an order that is **paid** and not **voided** or **cancelled**, counted on the **Manila day it was placed**.

Counted when paid, not when completed (counter cash is taken before the kitchen finishes). Voided GCash orders awaiting a
refund appear as a note, not revenue. The Sales page shows sales, orders, average order, items sold, per day, cash vs
GCash, by channel, **by branch** (when several are in view) and the top 10 dishes; ranges up to 366 days. Computed by one
database function (the data API returns at most 1,000 rows).

## Accounts

| Role | Created by |
| --- | --- |
| Customer | Signing up, or Google |
| Rider | An admin of their branch (Admin → Riders) |
| Admin | The super admin, with their branches (Admin → Admins) |
| Super admin | By hand, once ([setup.md](./setup.md#4-first-super-admin-new-projects-only)) |
| Cashier | One shared login per branch, created when its password is first set |

The role is read only from the login's `app_metadata` (server-written); no role = customer. Sessions refresh by
themselves and are shared across tabs; signing out ends **this device only** (the cashier login is shared) and empties
the cart. Customers edit their name, phone, default address (with pin) and password on **Profile**; Google accounts have
no password.

---

## Using it, by role

**Customer.** On `/` the branch map shows every branch (yours larger); the card beside the headline is your branch
(**Nearest to you** with location). Browse the menu without an account; dishes with sizes or choices open a picker. The
cart survives logging in. At checkout: **Which branch?**, **When?** (ASAP or a slot), **Pickup / Delivery**, a mobile
number (11 digits starting `09`, required for delivery), the address (tap the map, drag the pin or **Use my location**;
typed fields are never overwritten), **Cash** or **GCash**, **Place order**. **My orders** shows live progress, **Cancel**
while allowed, and **Chat with your rider** once a rider has it.

**Cashier.** `/cashier` → branch + password → **Open register**. Left: the queue (search by name or number, filter by
channel, tabs Active · Done · Cancelled · All, status counters). Right: the selected order with only the buttons that
apply: **Confirm**, **Send to kitchen**, **Start preparing**, **Mark ready**, **Complete**, **Take cash**, **GCash**,
**Approve / Reject** (online GCash), **Edit items**, **Void**. **Walk-in** creates a counter order; **Messages** is the
branch's website-chat inbox. Delivery orders have no payment buttons (paid online or collected by the rider).

**Rider.** `/driver`: **Available** (your branch's ready deliveries, with address, phone, cash to collect, map link) →
**Claim this delivery** → **My deliveries** (Chat, Release, Mark delivered) → **History**.

**Admin.** `/admin` with a **branch switcher** at the top: **Sales**, **Orders** (filters; **Mark refunded** on voided
GCash orders), **Menu** (sold out at a branch), **Riders**, **Kiosks**, **Employee passwords**. An admin can also open
the register at `/cashier` with their own login.

**Super admin.** Everything above for **All branches**, plus **Menu** editing (categories, dishes, prices, sizes,
choices, photos; ordered dishes can only be switched off), **Branches** (add, edit, hours, pin, open for orders),
**Admins** (create, set branches, deactivate) and **Site images** (the logo).
