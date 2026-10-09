# How it works: the rules behind the screens

This document explains what the system *does* and why, in the terms the business uses. It is the place to settle
"is that a bug or intended?". For where each rule lives in the code see [architecture.md](./architecture.md); for the
exact fields and limits see [data-dictionary.md](./data-dictionary.md).

**Contents:** [Branches](#branches) · [Orders](#orders) · [Scheduled orders](#scheduled-orders) ·
[Payments](#payments) · [Delivery](#delivery) · [Kiosk](#kiosk) ·
[Chat and photos](#chat-and-photos) · [Images](#images) · [Sales report](#sales-report) ·
[Accounts and sessions](#accounts-and-sessions) · [Validation](#validation)

---

## Branches

3K Kitchen has several branches (seven to start: GMA Terminal, Dasma Bayan, Langkaan, Gen-Tri, Trece, Silang, Imus).
**Every order belongs to exactly one branch**, and so do kiosks, website chats, cashier logins and riders.

| | Shared by every branch | Per branch |
| --- | --- | --- |
| Menu | The dishes, sizes, choices, photos and **prices** (edited by the super admin) | What is **sold out** today (any admin of that branch) |
| People | The super admin | Cashier login, riders (one branch each); admins (one or several) |
| Devices and passwords | | Kiosk devices, the kiosk password, the cashier password |
| Numbers and reports | | Order numbers; sales are reported per branch or across several |

**A branch** has a name, a short code (used in its cashier login, `cashier.<code>@3k.local`), an optional address and
phone, a **map location** and **opening hours** in Manila time (or none, meaning open around the clock). Only the
super admin adds and edits branches. A branch is never deleted: unticking **Open for orders** removes it from the map
and the pickers and refuses new orders and chats, while its past orders keep their history.

### Which branch an order goes to

| Channel | Branch |
| --- | --- |
| Online | The one the customer chose. Until they choose, it is the **nearest** branch if their browser shares its location, otherwise the first in the list; choosing one is remembered in their browser and always wins |
| Kiosk | The branch the device was unlocked for |
| Counter | The cashier's branch. An admin with several branches (or the super admin) picks the register's branch |

### Who sees what

| Role | Branches |
| --- | --- |
| Super admin | All of them, plus what they share: the menu and prices, branches, admin accounts, site images, roles |
| Admin | Only those assigned to them (one or more). Another branch's orders, sales, riders, kiosks, chats and passwords are invisible: asking for that branch is refused (403) and its orders are "not found" (404) |
| Cashier | Their branch's queue and website chats only |
| Rider | Their branch's pool of ready deliveries; their own deliveries |

Branch access is read from the database on every request, so adding or removing an admin's branch applies at once,
not when their login next refreshes. The same rule scopes the live feeds (row-level security), so a cashier's screen
never even receives another branch's orders.

### Sold out at one branch

The menu is shared, but each branch can run out of a dish. An admin of the branch marks it **sold out there**: it shows
as sold out on that branch's menu (website, kiosk and register), and an order for it at that branch is refused. Other
branches are unaffected. Switching a dish off everywhere is the super admin's ("Off everywhere").

---

## Orders

### Who may place what

| | Kiosk | Counter (POS) | Online |
| --- | --- | --- | --- |
| Placed by | The customer, at a terminal | The cashier | A logged-in customer |
| Fulfilment | Dine in, take out | Dine in, take out | Delivery, pickup |
| Identified by | The name typed at the kiosk | The name the cashier enters | The customer's account |
| Number prefix | `K-` | `P-` | `O-` |

The database enforces that pairing: a kiosk or counter order cannot be a delivery, and an online order cannot be dine-in.

### Order numbers

`K-0042`, `P-0013`, `O-0108`: a letter for the channel and a 4-digit count that **restarts every day** and is kept
**per branch**. "Day" means the **Manila day**, so an order at 9pm still belongs to today. A number is unique within its
branch and day: the same number may appear again on another day, or at another branch the same day. Staff only ever
search their own branch's queue, so this never causes confusion at the counter.

### Pricing

The server prices every order. A browser sends only *which* dishes, *which size* and *how many*; any price or total it
sends is ignored.

- Prices come from the live menu at the moment the order is placed, in whole centavos to avoid rounding drift.
- The price paid is **saved on each line**, so changing the menu later never rewrites past orders.
- A dish that is **sold out** (everywhere, or at the order's branch), **unknown**, has **no price yet**, or whose size
  does not belong to it is refused.
- Limits: a line holds 1 to 99 of a dish, an order at most 50 different dishes, and a total at most ₱999,999.99.

### Lifecycle

```
                  ┌─ confirm ─▶ confirmed ─▶ preparing ─▶ ready ─┬──────────────────────▶ completed
 pending ─────────┤        (or straight to preparing)             └─ rider claims ─▶ out_for_delivery ─▶ completed
   │              └─ "Send to kitchen" = confirm + preparing
   ├─ customer cancels ─▶ cancelled   (while pending/confirmed and not paid)
   └─ cashier/admin voids ─▶ voided   (any open order; refunds GCash)
```

- Moves are checked on the server. The only allowed moves are: `pending → confirmed` or `preparing`;
  `confirmed → preparing` or `ready`; `preparing → ready`; `ready → completed`; `out_for_delivery → completed`.
  Going backwards, jumping ahead (for example `pending → ready`) or moving a finished order is refused with a 409.
- A **delivery** order stops at `ready` for the cashier; a **rider** takes it (`out_for_delivery`) and completes it.
- A **kiosk** order paid by GCash is confirmed automatically, going straight to the kitchen with no cashier step.
- A **completed** order can no longer be voided.
- **Edit items** works only while *pending* or *confirmed*, and only if no payment has started (the amount is fixed
  once money is moving).

### Cancel vs void

| | Cancel | Void |
| --- | --- | --- |
| Who | The customer, on their own order | Cashier or admin of the order's branch |
| When | Pending or confirmed, and **not paid** (a failed GCash attempt counts as unpaid) | Any order not yet completed |
| Needs | Nothing | A **reason**, recorded with who voided it and when |
| Money | None involved | GCash is refunded; cash is returned by hand |

---

## Scheduled orders

An online customer orders **as soon as possible** or **for a later time** (pickup or delivery). Kiosk and counter
orders are always now.

| Rule | Value |
| --- | --- |
| As soon as possible | Only while the branch is **open now**. When it is closed, the order must be scheduled (the API answers 409 and checkout preselects the earliest time) |
| Slots | Every **15 minutes** (8:00, 8:15, …), Manila time |
| Earliest | **30 minutes** from now |
| Latest | The end of the day **after tomorrow** (today plus two days) |
| Hours | The slot must start inside the branch's opening hours (from opening, before closing). A branch with no hours takes any slot |

The checkout offers only valid slots; the server checks them again. Payment works the same as for any order (GCash is
paid when ordering; cash at pickup or on delivery).

**At the counter** a scheduled order is in the queue from the moment it is placed, so it can be confirmed and paid
early, but it is marked so nobody starts it too soon or forgets it:

- an **amber edge and clock badge** with its time, turning **orange with a countdown** within **an hour** of it;
- the Active tab sorts by **when things are due** (a scheduled order by its slot, others by when they arrived);
- the open order shows **Scheduled for …** and to **start preparing 30 minutes before**;
- a **Scheduled** filter shows only scheduled orders.

Riders, admins and the customer also see the time on the order.

---

## Payments

`payment_status` is tracked **separately** from the order's progress, because an order is often paid long before it is
finished (or finished before it is paid).

```
unpaid ──(GCash started)──▶ processing ──(PayMongo confirms)──▶ paid
   │                            └──(PayMongo reports failure)──▶ failed ──(try again)──▶ processing
   └──(cash taken)────────────────────────────────────────────▶ paid

paid ──(void a GCash order)──▶ refund_pending ──▶ refunded
                                     └──▶ refund_failed ──(void again / admin retry)──▶ refund_pending
```

### Cash

- **Counter and kiosk:** the cashier presses **Take cash**, types the amount handed over, and the system shows the
  change. Less than the total is refused.
- **Online delivery:** the **rider** collects it on delivery and records the amount (at least the total). **Online
  pickup:** the cashier takes it at the counter.
- Each cash payment is recorded once, with **who took it, how much was handed over and the change**, for the
  end-of-day count. A second payment attempt (a double tap, two cashiers) is refused.

### GCash (PayMongo)

1. The server creates a payment for the order total and returns a link; the customer pays in GCash.
2. **Only PayMongo's signed notification marks an order paid**, never the customer returning to the site, which could
   be faked or simply never happen.
3. The notification is checked (signature, and no older than 5 minutes), recorded by its id so a repeat does nothing,
   then applied. If applying fails, the record is removed and the server answers with an error so PayMongo **retries**.

Rules that protect the customer from being charged twice or losing money:

| Situation | What happens |
| --- | --- |
| The customer starts GCash again | The earlier attempt is cancelled first. If PayMongo says it is already going through, the new attempt is **refused** instead |
| The cashier takes cash while a GCash attempt is open | The GCash attempt is cancelled first, or the cash is refused if that payment is completing |
| GCash money arrives for an order already voided or cancelled | It is **refunded automatically**; if that fails the order is flagged for an admin |
| Voiding after a refund failed | The refund is **tried again**; the order is not voided while the money is still held |
| The amount paid differs from the order total | The order is marked paid and the mismatch is logged for review |
| Minimum | GCash needs an order of at least ₱20.00 |

Without PayMongo credentials the server runs normally; only the GCash actions answer "not configured" (503).

---

## Delivery

1. A customer places an online **delivery** order with an address and mobile number.
2. The cashier confirms it and takes it to **Mark ready**. It now appears in the **Available** list of every rider of
   **that branch** (riders of other branches never see it).
3. **First rider to claim wins.** The claim is a single guarded update, so two riders pressing at once cannot both
   get it; the loser is told it was taken.
4. The rider can **Release** it back to the pool, or deliver it. For cash on delivery the rider records the cash
   collected; that settles the payment and completes the order together.
5. A rider's account can be switched off by an admin; it takes effect on their next request, not at next login.

**Where to go:** the address is typed text plus, optionally, a **map pin** (latitude and longitude the customer dropped,
inside the Philippines). When there is a pin, riders, cashiers, admins and the customer get an **Open in Maps** link
that opens directions. Orders without a pin simply show the text.

---

## Kiosk

- A kiosk is **not a user**. It unlocks with its **branch** and that branch's kiosk password and is then given its own
  **device key**, bound to the branch and stored in that browser. The key is kept only as a hash on the server. Every
  order the kiosk takes goes to its branch, and its menu shows that branch's sold-out dishes.
- The key identifies *which terminal* took an order, can be **revoked per device** from Admin → Kiosks, and is rate
  limited per device.
- A kiosk can only see the orders **it** placed, and it polls for payment status (it has no login, so no live feed).
- It resets itself after 3 minutes untouched, 20 seconds after showing an order number, and a bit longer after a
  failed payment. Staff can lock it by tapping the logo five times.

---

## Chat and photos

### Two conversations

| | Website chat | Delivery chat |
| --- | --- | --- |
| Between | Anyone ↔ the cashier of the branch they pick | A customer ↔ the rider holding their order |
| Needs an account | No | Yes |
| Open | Always | Only while the order is **out for delivery**; readable afterwards |

### How a guest is recognised without logging in

Sending the first message creates a conversation and returns a **secret token**, which that browser keeps. Only a hash
of the token is stored. Every later request carries the token; without it the conversation cannot be read or written.
If the browser loses it, the guest simply starts a new chat.

The cashier sees guests as **`Guest-1023`** (or `Maria (Guest-1023)` when a name was given): the number is permanent per
conversation, so several guests at once can be told apart.

### Live updates

- **Cashier, customer, rider** receive new messages through the database's live feed; row-level security means each
  sees only their own conversations.
- **Guests** have no login to scope a live feed, so the server sends a content-free *ping* on a private channel named
  after their conversation; their browser then fetches the messages with its token. A forged or overheard ping reveals
  and changes nothing. Every client also refreshes about every 20 seconds as a safety net.

### Photos

| Rule | Value |
| --- | --- |
| Formats | JPEG, PNG, WebP (the file's actual contents are checked, not its name) |
| Size | Up to 5 MB; the browser shrinks photos to fit before uploading (a 7 MB camera photo becomes about 1 MB) |
| Per conversation | 30 photos at most |
| Guests | 10 photos per 10 minutes; can attach photos only after their first text message |
| Storage | A **private** bucket. Photos are shown through links that expire after an hour, issued only to people who can read that conversation |

Delivery-chat rules for text apply equally to photos: closed chats refuse both.

---

## Images

| What | Where | Rules |
| --- | --- | --- |
| **Product photos** | Public `menu-images` bucket; set per dish in Admin → Menu | JPEG/PNG/WebP, 5 MB; replacing or removing deletes the old file; a pasted web link is also accepted |
| **Logo and home photo** | Same bucket; Admin → Site images | "Reset" returns to the bundled defaults (`frontend/public/brand`) |
| **Chat photos** | Private `chat-images` bucket | See above |

Replaced photos get a new address, so no browser or network cache can show the old one.

---

## Sales report

The Sales page and `GET /admin/sales` use one definition:

> **A sale is an order that has been paid and has not been voided or cancelled.**

- **Counted when paid, not when completed.** Counter cash and kiosk GCash are paid before the kitchen finishes;
  online cash is paid on delivery. Waiting for "completed" would hide money already taken. A completed order cannot be
  voided, so a paid, live order is never reversed afterwards.
- **Refunds:** a refunded order is voided, so it drops out. Voided orders still waiting on a GCash refund are shown
  separately as a note and are **not** revenue. A voided paid cash order also drops out (the cash goes back by hand).
- **Which day:** the Manila day the order was **placed** (the same day its order number belongs to). A cash delivery
  settled after midnight counts on the day it was ordered.
- **What is measured:** sales (the sum of order totals), number of orders, average order, items sold, sales per day
  (quiet days shown as zero), cash vs GCash, by channel, and the 10 best-selling dishes, where a dish in two sizes
  counts as two lines. Best sellers use the price paid at the time.
- **Range:** Manila calendar days, both ends included, at most 366 days.
- **Branches:** an admin's report covers their branches (or the one chosen in the switcher); the super admin's covers
  every branch or one. When it covers several, sales **by branch** are shown too.

It is computed in the database by one function, because the data service returns at most 1,000 rows per request and a
busy month would otherwise be cut short silently.

---

## Accounts and sessions

| Role | Created by | Signs in with |
| --- | --- | --- |
| Customer | Signing up, or Google | Email and password, or Google |
| Rider | An admin of their branch | Email and password |
| Admin | The super admin, with the branches they manage | Email and password |
| Super admin | Seeded once (former admins were promoted) | Email and password |
| Cashier | One per branch: GMA's is seeded; others are created the first time an admin sets that branch's cashier password | The branch, then its shared **password** on `/cashier` (no email) |
| Kiosk | n/a | The branch, then its kiosk **password**, once per browser |

- **The role is decided only by the server.** It lives in the login's `app_metadata.role`, which only the server can
  write. A login with no role is a customer. Signing up or signing in with Google can never produce staff.
- **A session** (the login) refreshes itself a couple of minutes before it expires, is shared between browser tabs,
  and ends only when the server rejects it, not on a network blip. Signing out ends *that* device's session only
  (important for the shared cashier login) and empties the cart.
- **Google:** an ordinary customer account whose name and picture come from Google. It has no password to change.
- **Profile:** name, phone and a default delivery address (with pin) are editable by the customer. Role and active
  status are not editable by anyone through the profile.

---

## Validation

Every field is checked in **three places**, with the same rules: in the form (so people get an immediate message), in
the API (the real gate), and in the database (so a script cannot sneak bad data in). The complete list of rules, with
examples and where each is enforced, is in [data-dictionary.md](./data-dictionary.md#input-rules-the-same-everywhere).

The two worth remembering:

- **Mobile numbers are exactly 11 digits starting `09`**, digits only (`09171234567`).
- **Text is trimmed**, so a name of only spaces is rejected; prices have at most two decimals.
