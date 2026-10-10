# User guide

How to use the system, role by role. Button and page names below are the ones on screen. To try everything yourself
you need the logins in [test-accounts.md](./test-accounts.md).

**Jump to:** [Visitor and customer](#visitor-and-customer) · [Cashier](#cashier) · [Kiosk](#kiosk) ·
[Rider](#rider) · [Admin](#admin) · [Super admin](#super-admin) · [Chat and photos](#chat-and-photos)

---

## Visitor and customer

### Choosing a branch

3K Kitchen has several branches; every order is made and collected (or delivered) by one of them. The website (`/`)
opens on them:

- **The map** at the top shows every branch as the 3K Kitchen logo, framed on all of them; yours is the larger one
  ringed in red. Tap a pin for its address, hours, whether it is
  **open now**, how far it is from you, and **Order here**.
- **Your branch card** beside the headline: the branch you will order from (**Nearest to you** when you allow the
  browser to use your **location**, which it asks once; otherwise the first branch, or the one you picked), with its
  hours, open or closed now, distance, **Order from …** to jump to its menu, and **Directions** (opens your maps app).
  **Not this one? Choose another branch** scrolls to the list.
- **Find us in Cavite** lists every branch as a card, nearest first when your location is known, with its distance,
  **Directions** and **Order here**.
- The header stays at the top as you scroll, with **Branches**, **How it works** and **Menu** (just **Menu** on a phone).
  A blue dot on the map shows where you are.
- The **footer** lists all branches with their hours and whether each is open now.
- Choosing a branch yourself (any **Order here**) is remembered in your browser and always wins over the nearest.

You can also change branch later: the menu page shows **Ordering from** with a dropdown, and checkout has a **Which
branch?** dropdown (both sorted by distance, marking branches that are closed now).

### Browsing without an account

Further down (**Menu** in the header) is the **full menu** of your branch ("Ordering from …", with **Change**): search it, filter by
category, and tap a dish to see its options. Every branch has the same menu and prices; a dish your branch has run
out of shows as **Sold out**. You do **not** need an account to browse, build a cart or chat with the cashier.

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
2. Check **Which branch?** (your branch, see [Choosing a branch](#choosing-a-branch)).
3. Choose **When?**:
   - **As soon as possible**, only while the branch is open; or
   - **Schedule for later**: pick the **Day** (today, tomorrow or the day after) and a **Time** (every 15 minutes,
     at least 30 minutes from now, within the branch's opening hours).
   If the branch is closed right now, scheduling is chosen for you and the earliest time is preselected. The summary
   on the right shows the branch and the time.
4. Choose **Pickup** or **Delivery**.
5. Enter your **mobile number**: 11 digits starting with `09` (for example `09171234567`). It is optional for
   pickup and **required for delivery**, because the rider calls it.
6. For delivery, give the address. The easiest way is the **map**:
   - tap the map where the rider should come, or drag the pin; or press **Use my location**; or search for your
     street or barangay;
   - the street, barangay and city fill in for you. You can type over any of them and they are kept;
   - add a landmark and delivery notes if useful ("blue gate, ring twice");
   - tick **Save this as my default address** to have it filled in next time.
7. Choose payment: **Cash** (on delivery, or at pickup) or **GCash**.
8. Add notes for the kitchen if you like, then **Place order**.

With GCash you are sent to GCash to pay straight away, then returned to the app. GCash needs an order of at least
₱20.00. If you leave GCash without paying, open the order and press **Pay with GCash** to try again.

### Following your order

**My orders** (in the account menu at the top right) lists your orders with their branch, and the time for a
scheduled one ("For Tomorrow, 8:00 AM"); open one for a progress line:
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

Go to `/cashier`, choose this register's **Branch** and enter that branch's shared **employee password** (ask your
admin), then **Open register**. There is no email: the register is shared by whoever is on shift. The branch is
remembered on that device, and the screen only ever shows that branch's orders and messages. The branch name is shown
at the top.

### The screen

- **Left:** the queue. Search by order number or customer name ("Find by name or order number"), filter by
  channel, and use the tabs **Active · Done · Cancelled · All**. Small counters show how many are pending,
  confirmed, preparing, ready and out for delivery. New orders arrive by themselves, with no refresh needed.
- **Scheduled orders** (online orders for a later time) stand out: an **amber edge and clock badge** with the time
  ("Today, 8:00 AM"), turning **orange with a countdown** ("due in 25 min") within an hour of the time. The Active tab
  is in the order things are due (a scheduled order sorts by its time, others by when they came in), and the amber
  **Scheduled** counter shows only scheduled orders when pressed. Opening one shows **Scheduled for …** and when to
  **start preparing** (30 minutes before).
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

A self-order terminal for customers in a branch. Open `/kiosk` on the device, choose the **Branch** and enter that
branch's kiosk password once; the browser then remembers it is a kiosk of that branch, and every order it takes goes to
that branch. The start screen shows the branch name.

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

You deliver for one branch (set by your admin).

1. **Available** lists your branch's ready delivery orders nobody has taken yet, with the customer's address, phone (tap to call),
   whether to **collect cash** or the order is already **paid**, and **Open in Maps for directions** when the customer
   pinned their spot.
2. **Claim this delivery**. The first rider to press it gets it; anyone else is told it was already taken.
3. It moves to **My deliveries**. Use **Chat** to message the customer (photos too), **Release** to give it back to
   the pool, or **Mark delivered** when you arrive.
4. For cash on delivery, **Mark delivered** asks for the **cash collected** (at least the total). Then **Confirm
   delivered**.
5. **History** lists your finished deliveries.

A scheduled delivery shows its time on the card, like on the cashier screen.

If an admin deactivates your account you are signed out of rider features at once.

---

## Admin

An **admin** runs one or more branches, chosen by the super admin, and sees nothing of any other branch. Log in at
`/login` with your admin account; you land on **Sales**.

**The branch switcher** at the top right chooses what every page shows: one of your branches, or **All my branches**
(when you have more than one). With a single branch it just shows its name.

| Page | What it is for |
| --- | --- |
| **Sales** | How much was sold at the chosen branch(es). Pick **Today**, **7 days**, **30 days**, **This month** or **Custom**. Cards show sales, orders, average order and items sold; below are sales per day, cash vs GCash, sales by channel, **by branch** (when looking at several) and the top 10 dishes. **View as table** shows the daily numbers as text. Only paid orders that were not voided or cancelled count, on the day they were placed; voided orders still waiting on a GCash refund are shown as a note. See [how-it-works.md](./how-it-works.md#sales-report) |
| **Orders** | Every order of your branches, filterable by status, payment, channel and date, with a **Branch** column when looking at several. Scheduled orders show their time. Open one for details; retry a refund that PayMongo rejected |
| **Menu** | The shared menu. Choose a branch in the switcher and press **Mark sold out** on a dish to hide it **at that branch only** (it shows **Sold out at …**; **Back on** returns it). Adding and editing dishes and prices is the super admin's |
| **Riders** | Create rider accounts for one of your branches (branch, name, email, temporary password, phone) and deactivate or reactivate them |
| **Kiosks** | See and revoke your branches' kiosk devices, or issue a device key by hand for a branch |
| **Employee passwords** | Choose a branch, then change its **cashier** and **kiosk** passwords. Setting a branch's cashier password the first time creates that branch's register login. Changing it affects the next login only; kiosks that already unlocked keep working until their device is revoked |

You can also open the register at `/cashier` with your admin login; with several branches, pick the register's branch
at the top.

---

## Super admin

The super admin sees every branch and manages what they share. Besides everything an admin can do (with **All
branches** in the switcher), the left menu adds:

| Page | What it is for |
| --- | --- |
| **Menu** | Also add and rename categories; add, edit, switch off at every branch ("Off everywhere") or delete dishes; set prices, size options and choices; upload, replace or remove a **photo** per dish. A dish that has been ordered cannot be deleted (switch it off instead), and an option that appears in past orders cannot be removed (clear its price to hide it) |
| **Branches** | **New branch** and **Edit**: name, code (a short id, fixed once created), address, phone, **location** (drop the pin on the map, or search; the address fills in), **opening hours** in Manila time (or **Open 24 hours**), and **Open for orders**. Unticking it closes a branch: it leaves the map and takes no orders, but keeps its history. Branches are never deleted |
| **Admins** | **New admin** (name, email, temporary password, phone, and the **branches they manage**, at least one); **Branches** changes an admin's branches (it applies at once); **Deactivate** locks them out. Super admins are listed but not editable here |
| **Site images** | Replace the **logo** (header, home page, kiosk), or reset it to the default |

Photos you upload are shrunk in your browser first, so even a large camera photo is fine.

---

## Chat and photos

Two kinds of conversation, both live:

| Conversation | Who | Where |
| --- | --- | --- |
| **Website chat** | Anyone (no account) ↔ the cashier of a branch | The red **Chat with us** button on the landing page ↔ **Messages** on that branch's cashier screen |
| **Delivery chat** | A customer ↔ the rider holding their order | The **Chat with your rider** card on the order page ↔ **Chat** on the rider's delivery card |

- **Guests:** open **Chat with us**, choose which **branch** to ask (your branch by default), optionally give a
  name, and send a message. The conversation is remembered in that browser, so you can close the page and come back
  to the same chat.
- **Photos:** press the picture button beside the message box and choose a photo; it appears for the other person
  at once, and tapping it opens it full size. A guest can attach photos after their first message. Allowed: JPEG, PNG
  or WebP; large photos are shrunk automatically; at most 30 photos per conversation.
- **Delivery chat is only open while the order is out for delivery.** Before a rider takes it, the card says it opens
  then. After delivery the conversation stays readable but you can no longer send messages or photos.
- **Privacy:** photos are private. They are shown through temporary links to the people in that conversation only.
