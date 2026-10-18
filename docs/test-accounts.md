# Test accounts

> **Development only.** These credentials are deliberately simple and written down here.
> Before the system goes live: change every password (Admin → Employee passwords for each
> branch's cashier and kiosk, the admin and rider accounts from Admin or Supabase), delete the
> `@3k.local` test accounts, and remove this file.

## Start the app

```bash
npm run dev                     # app on http://localhost:5173
```

All of these accounts already exist in the demo Supabase project. If a password stops working, set it again: the
cashier and kiosk passwords from Admin → **Employee passwords**, riders from Admin → **Riders**, and any account from
the Supabase dashboard (Authentication → Users).

## Accounts

### Branch staff (every branch)

Cashier and kiosk are shared gate passwords **per branch**: open `/cashier` or `/kiosk`, pick the branch, type
the password. Branch admins sign in at `/login` with their email and land on `/admin`, seeing their branch only.

| Branch | Admin (`/login`, password `testpass12345`) | Cashier gate (`/cashier`) | Kiosk gate (`/kiosk`) |
| --- | --- | --- | --- |
| **GMA Terminal** | `admin.gma@3k.local` | `cashier123` | `kiosk123` |
| **Dasma Bayan** | `admin.dasma@3k.local` | `cashier-dasma` | `kiosk-dasma` |
| **Langkaan** | `admin.langkaan@3k.local` | `cashier-langkaan` | `kiosk-langkaan` |
| **Gen-Tri** | `admin.gentri@3k.local` | `cashier-gentri` | `kiosk-gentri` |
| **Trece** | `admin.trece@3k.local` | `cashier-trece` | `kiosk-trece` |
| **Silang** | `admin.silang@3k.local` | `cashier-silang` | `kiosk-silang` |
| **Imus** | `admin.imus@3k.local` | `testpass12345` | `kiosk-imus` |

Behind each cashier gate is a shared account: `cashier@3k.local` for GMA Terminal and `cashier.<code>@3k.local`
for the others (e.g. `cashier.dasma@3k.local`); the gate password is that account's password, so a cashier can also
sign in at `/login` with it. The kiosk password only unlocks the browser once: each unlock creates a device under
Admin → Kiosks, which an admin can revoke.

### Everyone else

| Role | Email | Password | Where to sign in | Access |
| --- | --- | --- | --- | --- |
| **Super admin** | `admin@3k.local` | `admin-3k-2026` | `/login` → lands on `/admin` (Sales) | Every branch: sales (with sales by branch), all orders and refunds, the shared menu and product photos, riders, kiosk devices, employee passwords of every branch, **Branches** (add/edit), **Admins** (create branch admins), site images (the logo). |
| **Area admin** (several branches) | `admin.area@3k.local` | `testpass12345` | `/login` → `/admin` | **Dasma Bayan, Langkaan and Gen-Tri**: the branch switcher offers those three (and all three together); sales by branch across them; their orders, riders, kiosks, employee passwords and sold-out dishes. Nothing of the other branches, and no Branches, Admins or Site images pages. |
| **Branch admin** | `admin.<code>@3k.local` (table above) | `testpass12345` | `/login` → `/admin` | One branch only, otherwise the same as the area admin. Another branch's orders, riders and kiosks never show up for them. |
| **Cashier** | *(gate)* | table above | `/cashier` → branch + password | Point of sale for that branch: order queue (scheduled orders highlighted), walk-in orders, confirm and advance orders, take cash, take GCash (check the receipt, type its reference no.), approve or reject a customer's GCash payment, void, edit items, **Messages** inbox for the branch's website chats. Cannot open `/admin` or `/driver`. |
| **Kiosk** | *(gate)* | table above | `/kiosk` → branch + password (once per browser) | Self-order terminal: dine-in and take-out orders, paying cash at the counter or GCash by scanning the QR and showing the receipt to the cashier. |
| **Rider (GMA Terminal)** | `rider1@3k.local` | `testpass12345` | `/login` → lands on `/driver` | GMA Terminal's delivery pool, claim and release orders, mark delivered (with cash collected), chat with the customer on a claimed order. |
| **Rider (Imus)** | `rider.imus@3k.local` | `testpass12345` | `/login` → `/driver` | Imus's delivery pool only. Other branches have no rider yet: create one in Admin → Riders. |
| **Customer** | `customer@3k.local` | `testpass12345` | `/login` → lands on `/menu` | Order for pickup or delivery, pay cash or GCash (send the reference no. or receipt), track and cancel own orders, profile, chat with the rider. |
| **Customer 2** | `customer2@3k.local` | `testpass12345` | `/login` | Same as Customer. Use it to check that one customer can never see another's orders or chat. |
| **Google customer** | your own Google account | *(none, Google sign-in)* | `/login` → *Continue with Google* | A customer, with no password to change. Needs the Google provider enabled in Supabase; while the Google app is in "Testing", only addresses listed as test users can sign in. |
| **Visitor** | *(no account)* | *(none)* | `/` | Browse the menu, add to cart, chat with the cashier. Asked to log in at checkout. |

The seven branches (GMA Terminal, Dasma Bayan, Langkaan, Gen-Tri, Trece, Silang, Imus) come from the
database migration, open 08:00–21:00 Manila time. Outside those hours online orders can only be
scheduled.

## What to test, by role

### Visitor (not logged in)
1. Open `/`. The hero is the map with all seven pins, framed on all of them. Allow location: the card beside the
   headline says **Nearest to you** with that branch, and **Find us in Cavite** sorts the branch cards nearest
   first. Tap a pin, then **Order here** on another branch: the page jumps to the menu, which says "Ordering from"
   that branch, and the card now says **Your branch**.
2. The full menu is near the bottom, with photos and prices; the footer lists every branch with its hours.
3. Add two dishes. A **Checkout** bar appears. Press it: you land on `/login`.
4. Log in as Customer. You return to **checkout with the cart intact**.
5. Back on `/` (logged out), press **Chat with us**, choose a branch, enter a name, send a message. Only that
   branch's cashier sees it.

### Customer
1. `/menu` (check the **Ordering from** branch) → add items → `/checkout`. Try **Pickup** and **Delivery**
   (street and city required).
2. **When?**: choose **As soon as possible** (only while the branch is open), or **Schedule for later** with a
   day and a 15-minute time. When the branch is closed, scheduling is preselected.
3. Place a cash order and open it from **My orders**: it shows the branch (and the time, if scheduled); the
   timeline updates as staff advance it.
4. **Profile** (avatar menu): edit name, phone, saved address, change password. The saved
   address and phone prefill the next checkout.
5. Cancel a pending, unpaid order.
6. Place a **GCash** order: the order page shows the QR, name and number. Type any reference number (e.g.
   `1012 345 678901`) and/or attach a screenshot, press **I've paid**: it shows **Awaiting verification** until a
   cashier approves it (then **Paid**) or rejects it (the reason shows and you can send it again).
7. While a rider holds a delivery order, a **Chat with your rider** card appears on the order page.

### Cashier
1. `/cashier`, Branch **GMA Terminal**, with the password. New online orders for GMA show up in the queue
   live; orders for other branches never do.
2. A **scheduled** order has an amber edge and a clock badge with its time (orange with a countdown within an
   hour), sorts by its time, and the **Scheduled** counter filters to them. Opening it shows when to start
   preparing.
3. Open an order → **Confirm** → **Start preparing** → **Mark ready** → **Complete**; try **Edit items** and **Void**.
4. **Walk-in** creates a counter order; take **cash** (change is calculated) or **GCash** (shows the QR; type the
   reference no. from the customer's receipt, **Mark paid**).
5. An online GCash order **Awaiting verification**: open it, check the reference no. / receipt, **Approve** or
   **Reject** with a reason. Voiding a paid GCash order leaves it **Refund pending** for an admin.
6. **Messages**: a visitor's chat to GMA appears with an unread badge; reply from the inbox.

### Rider
1. As Customer, place a **delivery** order at GMA Terminal. As Cashier, confirm it and take it to **ready**.
2. As Rider on `/driver`, the order appears under **Available**. (As the Imus rider it does not.) **Claim** it.
3. Under **My deliveries**, open **Chat** and message the customer; reply from the customer's order page.
4. **Mark delivered** (enter cash collected for cash-on-delivery). The chat then becomes read-only.

### Kiosk
1. `/kiosk` → Branch **GMA Terminal** + password → the start screen shows the branch → **Touch to order** → Dine
   in or Take out → pick dishes → review.
2. Pay cash (order number shown, pay at the counter) or GCash (the QR is shown next to the order number; at the
   cashier, settle it with **GCash** and the receipt's reference no.).
3. Admin → Kiosks lists the device; **revoke** it and the kiosk locks again.

### Super admin and branch admin
1. `/login` as the Super admin: you land on **Sales**, with **All branches** in the switcher at the top. Try *Today*, *7 days*, *30 days*, *This month* and *Custom*.
   Cards show sales, orders, average order and items sold; below are sales per day, cash vs GCash, sales by
   channel and best sellers (*View as table* gives the daily numbers as text). To see it fill up, take a few
   orders through to paid (cash or GCash at the counter) and press *Refresh*. Voided and
   cancelled orders never count; voided GCash orders awaiting a refund appear as a note. With several branches
   in view, **By branch** compares them; pick one branch in the switcher to see only it.
2. **Orders**: filter by status, payment, channel, date; a **Branch** column when viewing all; on a voided GCash order, **Mark refunded** once the money is sent back.
3. **Menu**: add or rename categories; add, edit, switch off everywhere or delete products; upload, replace or
   remove a product photo; edit size/price options. Pick a branch in the switcher to **Mark sold out** at it.
4. **Branches**: edit a branch's address, pin, hours (try **Open 24 hours**); add a new branch: it appears on the
   landing map. Untick **Open for orders** to take it off the map.
5. **Admins**: create an admin for two branches, log in as them, and check the switcher offers only those two. Or
   log in as the **area admin**: Dasma Bayan, Langkaan and Gen-Tri only.
6. **Riders**: create a rider for a branch, deactivate or reactivate one.
7. **Kiosks**: issue and revoke devices. **Site images**: replace the logo.
8. **Employee passwords**: choose a branch, change its cashier and kiosk passwords. Remember to change them
   back here (or re-run the seed command above) so this file stays accurate.
9. Log in as a **branch admin** (e.g. `admin.imus@3k.local`): everything above shows that branch only; asking the
   API for another branch (`?branch_id=`) is a 403.

## Test data to use

- **Mobile numbers must be 11 digits starting `09`**, digits only, e.g. `09171234567`. Anything else is rejected by the form, the app and the database.
- **Delivery needs a mobile number and an address.** On the checkout map, tap anywhere (or *Use my location*) to drop a pin; the street, barangay and city fill in. Try typing your own street afterwards: it is kept when you move the pin. The rider sees an **Open in Maps** link on the delivery card.
- The maps need internet access (they load OpenStreetMap tiles and address lookups).

## Two-browser recipes

Use two different browsers, or one normal window plus one private window, so sessions don't mix.

- **Website chat:** window A logged out on `/` sends a message. Window B on `/cashier` →
  Messages sees it within a couple of seconds and replies. A sees the reply without refreshing.
- **Photos in chat:** in either chat, press the picture button next to the message box and choose a photo (a large phone photo is fine, it is shrunk first). It appears for the other person without reloading; tap it to open it full size. A guest can attach photos after sending their first message.
- **Delivery chat:** window A as Customer on the order page, window B as Rider on `/driver` →
  My deliveries → Chat.
- **Isolation:** log in as Customer 2 and confirm Customer's orders and chats are not visible.
- **Branch isolation:** window A on `/cashier` as GMA Terminal, window B on `/cashier` as Imus. Place an online order
  at Imus: only window B shows it.
- **Area admin:** window A as `admin.area@3k.local`, window B on `/cashier` as Langkaan. An order at Langkaan shows up
  for both; one at Silang for neither.

## Limits you may hit while testing

| Limit | Value |
| --- | --- |
| Ordering as soon as possible | Only while the branch is open (08:00–21:00 for the seeded branches); otherwise schedule |
| Photos in one chat | 30 per conversation |
| New sign-ups | Supabase rate-limits sign-ups per IP; create riders and admins from the admin area instead |

## Automated checks

`npm run check:flows` signs in with these same accounts and passwords (see [testing.md](./testing.md) for what the
checks leave in the database). If you change one of these passwords, the checks need the same change.
