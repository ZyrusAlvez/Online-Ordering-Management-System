# User guide

How to use the system, role by role. Button and page names below are the ones on screen. To try everything yourself
you need the logins in [test-accounts.md](./test-accounts.md).

**Jump to:** [Visitor and customer](#visitor-and-customer) · [Cashier](#cashier) · [Kiosk](#kiosk) ·
[Rider](#rider) · [Admin](#admin) · [Chat and photos](#chat-and-photos)

---

## Visitor and customer

### Browsing without an account

Open the website (`/`). Below the headline and "How it works" is the **full menu**: search it, filter by category,
and tap a dish to see its options. You do **not** need an account to browse, build a cart or chat with the cashier.

- Dishes sold in sizes (for example Lechon Kawali 250g / 500g) ask you to **choose a size**; some also offer
  choices (fried or boiled). Add an optional instruction such as "no onions", pick a quantity (1 to 99) and add it.
- A confirmation appears at the **top** of the screen, and a red **Checkout** bar appears at the bottom with the item
  count and running total. The total shown is an estimate; the kitchen's current prices are used when you order.
- Your cart is remembered in your browser, so it is still there if you log in or come back later.

### Logging in

Pressing **Checkout** while logged out takes you to the login page, and brings you **back to your cart** afterwards.

| Option | How |
| --- | --- |
| Email and password | **Log in**, or **Sign up** to create an account (name, email, password of 8 or more characters) |
| Google | **Continue with Google** on the login or sign-up page |

### Placing an order

1. Open the cart (**Checkout**). Adjust quantities or remove items on the right.
2. Choose **Pickup** or **Delivery**.
3. Enter your **mobile number**: 11 digits starting with `09` (for example `09171234567`). It is optional for
   pickup and **required for delivery**, because the rider calls it.
4. For delivery, give the address. The easiest way is the **map**:
   - tap the map where the rider should come, or drag the pin; or press **Use my location**; or search for your
     street or barangay;
   - the street, barangay and city fill in for you. You can type over any of them and they are kept;
   - add a landmark and delivery notes if useful ("blue gate, ring twice");
   - tick **Save this as my default address** to have it filled in next time.
5. Choose payment: **Cash** (on delivery, or at pickup) or **GCash**.
6. Add notes for the kitchen if you like, then **Place order**.

With GCash you are sent to GCash to pay straight away, then returned to the app. GCash needs an order of at least
₱20.00. If you leave GCash without paying, open the order and press **Pay with GCash** to try again.

### Following your order

**My orders** (in the account menu at the top right) lists your orders; open one for a progress line:
*Received → Confirmed → Preparing → Ready → On the way (delivery) → Done*. It updates by itself, with no refresh.

- You can **Cancel order** while it is still *pending* or *confirmed* and **not paid**.
- A paid order cannot be cancelled by you; ask the cashier, who can void it (and a GCash payment is refunded).
- For a delivery, a **Chat with your rider** card appears once a rider picks it up. See [Chat and photos](#chat-and-photos).
- If you pinned your location, the order shows **View pinned location**.

### Your profile

Account menu (your picture or initials, top right) → **Profile**:

- change your name and mobile number;
- save or remove a default delivery address (with its map pin);
- change your password (only for email accounts; Google accounts have no password here).

Your role and active status are not editable by you. **Sign out** is in the same menu; it also empties the cart,
so the next person on a shared device starts fresh.

---

## Cashier

Go to `/cashier` and enter the shared **employee password** (ask the admin), then **Open register**. There is no
email: the register is shared by whoever is on shift.

### The screen

- **Left:** the queue. Search by order number or customer name ("Find by name or order number"), filter by
  channel, and use the tabs **Active · Done · Cancelled · All**. Small counters show how many are pending,
  confirmed, preparing, ready and out for delivery. New orders arrive by themselves, with no refresh needed.
- **Right:** the selected order, with its items, customer, address (and **Open in Maps** if the customer pinned
  one), notes, payment state and the actions below.
- **Top:** **Messages** (website chat, with an unread badge) and **Walk-in** (new counter order).

### Working an order

Buttons appear only when they make sense:

| Button | When | What it does |
| --- | --- | --- |
| **Confirm** | Order is pending | Accepts it |
| **Send to kitchen** | Order is pending | Accepts it and starts preparing in one step |
| **Start preparing**, **Mark ready**, **Complete** | Following stages | Moves it along the line. Only valid moves are offered (for example you cannot jump from pending straight to ready). For a **delivery**, the cashier stops at **Mark ready**: a rider takes it from there and completes it on delivery |
| **Take cash** | Unpaid orders that are not deliveries (counter, kiosk, and online pickup paid at the counter) | Opens the cash window: type what the customer handed over and it shows the **change** to give back. Paying less than the total is refused |
| **GCash QR** | Same orders as **Take cash** | Shows a QR code for the customer to pay with GCash |
| **Edit items** | Pending or confirmed | Change quantities or items; the total is recalculated. Refused once a payment has started, since the amount is already fixed |
| **Void** | Any order that is still open | Cancels it with a **reason**. A paid GCash order is refunded automatically; cash is returned by hand |

Delivery orders are paid differently: online GCash is paid by the customer in the app, and cash is collected by the
rider on delivery, so the cashier has no payment buttons on them.

If a GCash refund fails, the order shows **refund failed**; press **Void** again to retry, or ask an admin to retry
it from the Orders page.

### Walk-in orders

**Walk-in** → enter the customer's name, choose **Dine in** or **Take out** and **Cash** or **GCash**, add dishes from
the menu, and create the order. It joins the queue like any other.

### Kiosk orders

Customers type their name at the kiosk. Search for it (or the order number on their receipt screen) to find the order.
If they chose cash, take the payment; if they paid by GCash it is already confirmed and in the kitchen.

### Messages

**Messages** opens the inbox of website chats, newest first, unread in bold with a dot. Guests appear as
`Guest-1023`, or `Maria (Guest-1023)` if they gave a name, so several guests at once can be told apart. Open one to
read it and reply; opening it marks it read. You can also send and receive photos. See [Chat and photos](#chat-and-photos).

---

## Kiosk

A self-order terminal for customers in the restaurant. Open `/kiosk` on the device and enter the employee password
once; the browser then remembers it is a kiosk.

**For the customer**

1. Touch the screen (**Touch to order**).
2. Choose **Dine in** or **Take out**.
3. Tap dishes to add them (sizes and choices work as on the website). **Review order**.
4. Type your name ("so we can call your order") and choose how to pay: **Cash** (pay at the counter) or **GCash**
   (pay now with your phone).
5. **Place order**. The screen shows **Thank you!** and your **order number**. For GCash you are sent to pay first.
   The screen then returns to the start by itself.

The kiosk starts over by itself after about 3 minutes of nobody touching it, and shortly after an order is shown.
A failed or unfinished GCash payment also clears itself after a while.

**For staff**

- The device appears in **Admin → Kiosks**, where it can be **revoked**; the kiosk then locks again and asks for the
  password.
- To lock a kiosk yourself, tap the logo on the start screen **5 times quickly** and confirm.

---

## Rider

Log in at `/login` with the email and password an admin gave you; you land on `/driver`.

1. **Available** lists ready delivery orders nobody has taken yet, with the customer's address, phone (tap to call),
   whether to **collect cash** or the order is already **paid**, and **Open in Maps for directions** when the customer
   pinned their spot.
2. **Claim this delivery**. The first rider to press it gets it; anyone else is told it was already taken.
3. It moves to **My deliveries**. Use **Chat** to message the customer (photos too), **Release** to give it back to
   the pool, or **Mark delivered** when you arrive.
4. For cash on delivery, **Mark delivered** asks for the **cash collected** (at least the total). Then **Confirm
   delivered**.
5. **History** lists your finished deliveries.

If an admin deactivates your account you are signed out of rider features at once.

---

## Admin

Log in at `/login` with the admin account; you land on **Sales**. The left menu has:

| Page | What it is for |
| --- | --- |
| **Sales** | How much was sold. Pick **Today**, **7 days**, **30 days**, **This month** or **Custom**. Cards show sales, orders, average order and items sold; below are sales per day, cash vs GCash, sales by channel and the top 10 dishes. **View as table** shows the daily numbers as text. Only paid orders that were not voided or cancelled count, on the day they were placed; voided orders still waiting on a GCash refund are shown as a note. See [how-it-works.md](./how-it-works.md#sales-report) |
| **Orders** | Every order, filterable by status, payment, channel and date. Open one for details; retry a refund that PayMongo rejected |
| **Menu** | Add and rename categories; add, edit, hide ("Sold out") or delete dishes; set prices, size options and choices; upload, replace or remove a **photo** per dish. A dish that has been ordered cannot be deleted (mark it sold out instead), and an option that appears in past orders cannot be removed (clear its price to hide it) |
| **Riders** | Create rider accounts (name, email, temporary password, phone) and deactivate or reactivate them |
| **Kiosks** | See and revoke kiosk devices, or issue a device key by hand |
| **Site images** | Replace the **logo** and the home-page **promo photo**, or reset them to the defaults |
| **Employee passwords** | Change the **cashier** and **kiosk** passwords. Changing the cashier password affects the next login only; kiosks that already unlocked keep working until their device is revoked |

Photos you upload are shrunk in your browser first, so even a large camera photo is fine.

---

## Chat and photos

Two kinds of conversation, both live:

| Conversation | Who | Where |
| --- | --- | --- |
| **Website chat** | Anyone (no account) ↔ the cashier | The red **Chat with us** button on the landing page ↔ **Messages** on the cashier screen |
| **Delivery chat** | A customer ↔ the rider holding their order | The **Chat with your rider** card on the order page ↔ **Chat** on the rider's delivery card |

- **Guests:** open **Chat with us**, optionally give a name, and send a message. The conversation is remembered in
  that browser, so you can close the page and come back to the same chat.
- **Photos:** press the picture button beside the message box and choose a photo; it appears for the other person
  at once, and tapping it opens it full size. A guest can attach photos after their first message. Allowed: JPEG, PNG
  or WebP; large photos are shrunk automatically; at most 30 photos per conversation.
- **Delivery chat is only open while the order is out for delivery.** Before a rider takes it, the card says it opens
  then. After delivery the conversation stays readable but you can no longer send messages or photos.
- **Privacy:** photos are private. They are shown through temporary links to the people in that conversation only.
