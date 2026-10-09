# Test accounts

> **Development only.** These credentials are deliberately simple and written down here.
> Before the system goes live: change every password (Admin → Employee passwords for each
> branch's cashier and kiosk, the admin and rider accounts from the API/Supabase), delete the
> `@3k.local` test accounts, and remove this file.

## Start the app

```bash
cd backend  && npm run dev      # API on http://localhost:4000
cd frontend && npm run dev      # app on http://localhost:5173
```

If a login stops working, re-seed (safe to repeat, it resets the passwords below):

```bash
cd backend
SEED_ADMIN_PASSWORD=admin-3k-2026 SEED_CASHIER_PASSWORD=cashier123 SEED_KIOSK_PASSWORD=kiosk123 \
  node --env-file=.env scripts/seed-accounts.mjs          # super admin, GMA cashier, GMA kiosk
node --env-file=.env scripts/dev/seed-test-users.mjs      # customers, riders, Imus admin and cashier
```

## Accounts

| Role | Email | Password | Where to sign in | Access |
| --- | --- | --- | --- | --- |
| **Super admin** | `admin@3k.local` | `admin-3k-2026` | `/login` → lands on `/admin` (Sales) | Every branch: sales (with sales by branch), all orders and refunds, the shared menu and product photos, riders, kiosk devices, employee passwords of every branch, **Branches** (add/edit), **Admins** (create branch admins), site images (the logo). |
| **Branch admin (Imus)** | `admin.imus@3k.local` | `testpass12345` | `/login` → `/admin` | Imus only: its sales, orders, riders, kiosks, employee passwords and sold-out dishes. Sees nothing of the other branches, and no Branches, Admins or Site images pages. |
| **Cashier (GMA Terminal)** | *(none, password only)* | `cashier123` | `/cashier` → Branch **GMA Terminal** + password | Point of sale for GMA Terminal: order queue (scheduled orders highlighted), walk-in orders, confirm and advance orders, take cash or GCash, void (GCash orders are refunded), edit items, **Messages** inbox for GMA's website chats. Cannot open `/admin` or `/driver`. |
| **Cashier (Imus)** | `cashier.imus@3k.local` | `testpass12345` | `/login`, or `/cashier` → Branch **Imus** + `testpass12345` | The same for Imus. Use it beside the GMA cashier to see that each register only shows its own branch. |
| **Kiosk (GMA Terminal)** | *(none, password only)* | `kiosk123` | `/kiosk` → Branch **GMA Terminal** + password (once per browser) | Self-order terminal for GMA Terminal: place dine-in and take-out orders paying cash or GCash. Each unlock creates a device under Admin → Kiosks, which an admin can revoke. Other branches have no kiosk password until an admin sets one. |
| **Rider (GMA Terminal)** | `rider1@3k.local` | `testpass12345` | `/login` → lands on `/driver` | GMA Terminal's delivery pool, claim and release orders, mark delivered (with cash collected), chat with the customer on a claimed order. |
| **Rider (Imus)** | `rider.imus@3k.local` | `testpass12345` | `/login` → `/driver` | Imus's delivery pool only. |
| **Customer** | `customer@3k.local` | `testpass12345` | `/login` → lands on `/menu` | Order for pickup or delivery, pay cash or GCash, track and cancel own orders, profile, chat with the rider. |
| **Customer 2** | `customer2@3k.local` | `testpass12345` | `/login` | Same as Customer. Use it to check that one customer can never see another's orders or chat. |
| **Google customer** | your own Google account | *(none, Google sign-in)* | `/login` → *Continue with Google* | A customer, with no password to change. Needs the Google provider enabled in Supabase; while the Google app is in "Testing", only addresses listed as test users can sign in. |
| **Visitor** | *(no account)* | *(none)* | `/` | Browse the menu, add to cart, chat with the cashier. Asked to log in at checkout. |

Cashier and kiosk are shared gate passwords **per branch** rather than personal accounts, so the
login screens ask for the branch and a single password. (Behind the scenes GMA Terminal's cashier
password is the password of `cashier@3k.local`; another branch's register login is
`cashier.<code>@3k.local`, created the first time an admin sets that branch's cashier password.)

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
6. While a rider holds a delivery order, a **Chat with your rider** card appears on the order page.

### Cashier
1. `/cashier`, Branch **GMA Terminal**, with the password. New online orders for GMA show up in the queue
   live; orders for other branches never do.
2. A **scheduled** order has an amber edge and a clock badge with its time (orange with a countdown within an
   hour), sorts by its time, and the **Scheduled** counter filters to them. Opening it shows when to start
   preparing.
3. Open an order → **Confirm** → **Start preparing** → **Mark ready** → **Complete**; try **Edit items** and **Void**.
4. **Walk-in** creates a counter order; take **cash** (change is calculated) or **GCash** (QR).
5. **Messages**: a visitor's chat to GMA appears with an unread badge; reply from the inbox.

### Rider
1. As Customer, place a **delivery** order at GMA Terminal. As Cashier, confirm it and take it to **ready**.
2. As Rider on `/driver`, the order appears under **Available**. (As the Imus rider it does not.) **Claim** it.
3. Under **My deliveries**, open **Chat** and message the customer; reply from the customer's order page.
4. **Mark delivered** (enter cash collected for cash-on-delivery). The chat then becomes read-only.

### Kiosk
1. `/kiosk` → Branch **GMA Terminal** + password → the start screen shows the branch → **Touch to order** → Dine
   in or Take out → pick dishes → review.
2. Pay cash (order number shown, pay at the counter) or GCash.
3. Admin → Kiosks lists the device; **revoke** it and the kiosk locks again.

### Super admin and branch admin
1. `/login` as the Super admin: you land on **Sales**, with **All branches** in the switcher at the top. Try *Today*, *7 days*, *30 days*, *This month* and *Custom*.
   Cards show sales, orders, average order and items sold; below are sales per day, cash vs GCash, sales by
   channel and best sellers (*View as table* gives the daily numbers as text). To see it fill up, take a few
   orders through to paid (cash at the counter, or a GCash kiosk order) and press *Refresh*. Voided and
   cancelled orders never count; voided GCash orders awaiting a refund appear as a note. With several branches
   in view, **By branch** compares them; pick one branch in the switcher to see only it.
2. **Orders**: filter by status, payment, channel, date; a **Branch** column when viewing all; retry a failed refund.
3. **Menu**: add or rename categories; add, edit, switch off everywhere or delete products; upload, replace or
   remove a product photo; edit size/price options. Pick a branch in the switcher to **Mark sold out** at it.
4. **Branches**: edit a branch's address, pin, hours (try **Open 24 hours**); add a new branch: it appears on the
   landing map. Untick **Open for orders** to take it off the map.
5. **Admins**: create an admin for two branches, log in as them, and check the switcher offers only those two.
6. **Riders**: create a rider for a branch, deactivate or reactivate one.
7. **Kiosks**: issue and revoke devices. **Site images**: replace the logo.
8. **Employee passwords**: choose a branch, change its cashier and kiosk passwords. Remember to change them
   back here (or re-run the seed command above) so this file stays accurate.
9. Log in as the **Imus admin**: everything above shows Imus only; asking the API for GMA (`?branch_id=`) is a 403.

## Test data to use

- **Mobile numbers must be 11 digits starting `09`**, digits only, e.g. `09171234567`. Anything else is rejected by the form, the API and the database.
- **Delivery needs a mobile number and an address.** On the checkout map, tap anywhere (or *Use my location*) to drop a pin; the street, barangay and city fill in. Try typing your own street afterwards: it is kept when you move the pin. The rider sees an **Open in Maps** link on the delivery card.
- The maps need internet access (they load CARTO map tiles and OpenStreetMap address lookups).

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

## Limits you may hit while testing

| Limit | Value |
| --- | --- |
| Cashier password and kiosk unlock attempts | 10 wrong guesses per 15 minutes per IP, all branches together. A `429` clears after the window. |
| Ordering as soon as possible | Only while the branch is open (08:00–21:00 for the seeded branches); otherwise schedule |
| Starting website chats | 5 per hour per IP |
| Chat messages | 20 per minute |
| Changing a password | 10 attempts per 15 minutes |
| New sign-ups | Supabase rate-limits sign-ups per IP; create extra users from the admin API instead |

## Automated tests

`cd backend && npm test` logs in with these same accounts (read from `backend/.env`:
`TEST_ADMIN_PASSWORD`, `TEST_CASHIER_PASSWORD`, `TEST_KIOSK_PASSWORD`; the Imus accounts and riders use
`testpass12345`). If you change a password here, update `.env` too, or run the seed commands so both stay
in step. The branch tests set a test-only Imus kiosk password (`imus-kiosk-1`).
