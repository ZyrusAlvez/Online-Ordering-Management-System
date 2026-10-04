# Test accounts

> **Development only.** These credentials are deliberately simple and written down here.
> Before the system goes live: change every password (Admin → Employee passwords for
> cashier and kiosk, the admin and rider accounts from the API/Supabase), delete the
> `@3k.local` test customers, and remove this file.

## Start the app

```bash
cd backend  && npm run dev      # API on http://localhost:4000
cd frontend && npm run dev      # app on http://localhost:5173
```

If a login stops working, re-seed (safe to repeat, it resets the passwords below):

```bash
cd backend
SEED_ADMIN_PASSWORD=admin-3k-2026 SEED_CASHIER_PASSWORD=cashier123 SEED_KIOSK_PASSWORD=kiosk123 \
  node --env-file=.env scripts/seed-accounts.mjs          # admin, cashier, kiosk
node --env-file=.env scripts/dev/seed-test-users.mjs      # customers and rider
```

## Accounts

| Role | Email | Password | Where to sign in | Access |
| --- | --- | --- | --- | --- |
| **Admin** | `admin@3k.local` | `admin-3k-2026` | `/login` → lands on `/admin` | Everything: all orders and refunds, menu and product photos, riders, kiosk devices, site images (logo, promo), the cashier and kiosk passwords. |
| **Cashier** | *(none, password only)* | `cashier123` | `/cashier` (the page asks only for the password) | Point of sale: order queue, walk-in orders, confirm and advance orders, take cash or GCash, void (GCash orders are refunded), edit items, **Messages** inbox for website chat. Cannot open `/admin` or `/driver`. |
| **Kiosk** | *(none, password only)* | `kiosk123` | `/kiosk` (asks only for the password, once per browser) | Self-order terminal: place dine-in and take-out orders paying cash or GCash. Each unlock creates a device under Admin → Kiosks, which an admin can revoke. |
| **Rider** | `rider1@3k.local` | `testpass12345` | `/login` → lands on `/driver` | Delivery pool, claim and release orders, mark delivered (with cash collected), chat with the customer on a claimed order. |
| **Customer** | `customer@3k.local` | `testpass12345` | `/login` → lands on `/menu` | Order for pickup or delivery, pay cash or GCash, track and cancel own orders, profile, chat with the rider. |
| **Customer 2** | `customer2@3k.local` | `testpass12345` | `/login` | Same as Customer. Use it to check that one customer can never see another's orders or chat. |
| **Google customer** | your own Google account | *(none, Google sign-in)* | `/login` → *Continue with Google* | A customer, with no password to change. Needs the Google provider enabled in Supabase; while the Google app is in "Testing", only addresses listed as test users can sign in. |
| **Visitor** | *(no account)* | *(none)* | `/` | Browse the menu, add to cart, chat with the cashier. Asked to log in at checkout. |

Cashier and kiosk are shared gate passwords rather than personal accounts, so the login
screens show a single password field. (Behind the scenes the cashier password is the
password of `cashier@3k.local`.)

## What to test, by role

### Visitor (not logged in)
1. Open `/`. The full menu is below "How it works", with photos and prices.
2. Add two dishes. A **Checkout** bar appears. Press it: you land on `/login`.
3. Log in as Customer. You return to **checkout with the cart intact**.
4. Back on `/` (logged out), press **Chat with us**, enter a name, send a message.

### Customer
1. `/menu` → add items → `/checkout`. Try **Pickup** and **Delivery** (street and city required).
2. Place a cash order and open it from **My orders**: the timeline updates as staff advance it.
3. **Profile** (avatar menu): edit name, phone, saved address, change password. The saved
   address and phone prefill the next checkout.
4. Cancel a pending, unpaid order.
5. While a rider holds a delivery order, a **Chat with your rider** card appears on the order page.

### Cashier
1. `/cashier` with the password. New online orders show up in the queue live.
2. Open an order → **Confirm** → **Start preparing** → **Mark ready** → **Complete**; try **Edit items** and **Void**.
3. **Walk-in** creates a counter order; take **cash** (change is calculated) or **GCash** (QR).
4. **Messages**: a visitor's chat appears with an unread badge; reply from the inbox.

### Rider
1. As Customer, place a **delivery** order. As Cashier, confirm it and take it to **ready**.
2. As Rider on `/driver`, the order appears under **Available**. **Claim** it.
3. Under **My deliveries**, open **Chat** and message the customer; reply from the customer's order page.
4. **Mark delivered** (enter cash collected for cash-on-delivery). The chat then becomes read-only.

### Kiosk
1. `/kiosk` → password → **Touch to order** → Dine in or Take out → pick dishes → review.
2. Pay cash (order number shown, pay at the counter) or GCash.
3. Admin → Kiosks lists the device; **revoke** it and the kiosk locks again.

### Admin
1. `/login` as Admin. **Orders**: filter by status, payment, channel, date; retry a failed refund.
2. **Menu**: add or rename categories; add, edit, hide ("sold out") or delete products;
   upload, replace or remove a product photo; edit size/price options.
3. **Riders**: create a rider, deactivate or reactivate one.
4. **Kiosks**: issue and revoke devices. **Site images**: replace the logo and home-page photo.
5. **Employee passwords**: change the cashier and kiosk passwords. Remember to change them back
   here (or re-run the seed command above) so this file stays accurate.

## Test data to use

- **Mobile numbers must be 11 digits starting `09`**, digits only, e.g. `09171234567`. Anything else is rejected by the form, the API and the database.
- **Delivery needs a mobile number and an address.** On the checkout map, tap anywhere (or *Use my location*) to drop a pin; the street, barangay and city fill in. Try typing your own street afterwards: it is kept when you move the pin. The rider sees an **Open in Maps** link on the delivery card.
- The map needs internet access (it loads OpenStreetMap tiles and address lookups).

## Two-browser recipes

Use two different browsers, or one normal window plus one private window, so sessions don't mix.

- **Website chat:** window A logged out on `/` sends a message. Window B on `/cashier` →
  Messages sees it within a couple of seconds and replies. A sees the reply without refreshing.
- **Delivery chat:** window A as Customer on the order page, window B as Rider on `/driver` →
  My deliveries → Chat.
- **Isolation:** log in as Customer 2 and confirm Customer's orders and chats are not visible.

## Limits you may hit while testing

| Limit | Value |
| --- | --- |
| Cashier password and kiosk unlock attempts | 10 per 15 minutes per IP (a wrong guess counts). A `429` clears after the window. |
| Starting website chats | 5 per hour per IP |
| Chat messages | 20 per minute |
| Changing a password | 10 attempts per 15 minutes |
| New sign-ups | Supabase rate-limits sign-ups per IP; create extra users from the admin API instead |

## Automated tests

`cd backend && npm test` logs in with these same accounts (read from `backend/.env`:
`TEST_ADMIN_PASSWORD`, `TEST_CASHIER_PASSWORD`, `TEST_KIOSK_PASSWORD`). If you change a password
here, update `.env` too, or run the seed command so both stay in step.
