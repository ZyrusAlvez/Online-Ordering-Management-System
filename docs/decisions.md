# Design decisions

The significant choices, each with the reason, so nobody has to rediscover it (or undo it by accident). Format:
**Decision**, **Why**, **Trade-off**. Add an entry whenever you make a choice you would have to explain again.

**Contents:** [Architecture](#architecture) · [Branches](#branches) · [Security and access](#security-and-access) · [Orders and money](#orders-and-money) ·
[Chat and images](#chat-and-images) · [Reporting](#reporting) · [Frontend and design](#frontend-and-design) ·
[Process](#process)

---

## Architecture

### Next.js and Supabase only; no API server (2026-10-18)
**Decision.** The Express API and the Vite app were replaced by one Next.js app laid out like the team's Pasuyo project
(`app/`, `controllers/`, `models/`, `view/components`, `view/presentation/<feature>`). Screens call controllers,
controllers call models, models call Supabase directly from the browser.
**Why.** Supabase already is the backend (database, auth, storage, realtime); a second server only relayed requests.
One app, one deployment.
**Trade-off.** Rules the API used to enforce had to move into the database (policies and triggers) so a browser cannot
skip them, and Express's in-memory rate limits were lost ([security.md](./security.md#rate-limits)). The earlier
decision "browsers never write to the database" is retired: they write, and the database checks.

### The secret key stays on the server, unlike Pasuyo
**Decision.** Pasuyo puts its service role key in the browser bundle. Here it is read only by
`src/utils/supabaseAdmin.ts` (`server-only`), used by Next.js server actions for what has no logged-in user (kiosk,
guest chat, the cashier gate) or manages other people's accounts (riders, admins, employee passwords).
**Why.** Anyone can read a browser bundle; that key bypasses every policy.

### Money rules are database triggers
**Decision.** `price_order_item`, `recompute_order_total`, `guard_order` and `guard_payment` own prices, totals and
payment status for browser writes. The controllers check the same rules first, for clear messages.
**Why.** An earlier version let customers insert and update their own orders directly, which allowed free and
self-"paid" orders ([security.md](./security.md#issues-found-and-fixed)). With browser writes back, the database itself
must refuse them.

### Layered: screens → controllers → models
**Decision.** Screens only render and call controllers; controllers hold the rules and return `Result<T>`; models only
query. Changes have an obvious home ([architecture.md](./architecture.md#where-does-my-change-go)).

---

## Branches

### One shared menu, sold out per branch
**Decision.** Dishes, sizes, photos and prices are one list for every branch, edited only by the super admin. A branch
can only mark a dish **sold out** for itself (`branch_unavailable_products`).
**Why.** The branches sell the same food at the same prices; keeping one menu avoids seven copies drifting apart. What really
differs day to day is what a branch has run out of.
**Trade-off.** A branch cannot have its own dish or price. That would need per-branch prices on top of this table.

### Branch access is read from the database on every request
**Decision.** Which branches an account works at lives in `branch_staff` and is read on each staff request
(`loadBranchScope`) and by the row-level-security helper `has_branch_access()`, rather than being copied into the login
token like the role.
**Why.** Taking a branch away from an admin must apply at once, not when their token next refreshes (up to an hour); and
there is one source of truth instead of two copies to keep in step.
**Trade-off.** One small extra query per staff request, and per row for live-feed policies. Negligible at this size.

### Two admin roles: `admin` per branch, `super_admin` for everything
**Decision.** `admin` is limited to the branches in `branch_staff` (one or several); `super_admin` sees every branch and
alone manages what they share: branches, admin accounts, the menu and prices, site images and roles. Existing admins
were promoted to super admin.
**Why.** Branch managers need full control of their own branch and nothing else; the owner needs the whole picture.
**Trade-off.** Another branch's order answers 404 to an admin, which can puzzle someone who expected to see it.

### One shared cashier login and one kiosk password per branch
**Decision.** Each branch has its own register account (`cashier.<code>@…`, created the first time its password is set;
GMA Terminal keeps `cashier@3k.local`) and its own kiosk password. The gates ask for the branch first, and remember it.
**Why.** A register and a kiosk physically belong to one branch, and the app then scopes them without any per-request
choice. One branch's password can never open another.
**Trade-off.** Cash is still attributed to the branch's shared account, not a person.

### Order numbers count per branch
**Decision.** `K-0042` keeps its format; the daily count is per branch, and uniqueness is per branch per day.
**Why.** Staff read numbers aloud and only ever look at their own branch's queue, so short numbers matter more than
global uniqueness. A branch prefix would make every number longer for no benefit at the counter.
**Trade-off.** Two branches can show the same number on the same day. Every screen that spans branches also shows the branch.

### Scheduled orders: 15-minute slots, two days ahead, inside opening hours; ASAP only while open
**Decision.** Online orders are for "as soon as possible" (only while the branch is open) or a 15-minute slot at least 30
minutes ahead, up to the end of the day after tomorrow, starting inside the branch's hours. The same rules live in
`src/utils/schedule.ts`, used by both checkout (the slots it offers) and the order controller (what it accepts).
**Why.** Customers want to order ahead (and at night); the kitchen needs a bounded, readable list. Refusing ASAP when
closed avoids orders nobody will see until morning being treated as urgent.
**Trade-off.** No overnight hours (a branch closing after midnight); `closes_at` must be after `opens_at`.

### Scheduled orders are in the queue at once, marked rather than hidden
**Decision.** They appear immediately, sorted by their time, with an amber edge and badge that turns orange an hour before.
**Why.** The cashier can confirm and take payment early and see what is coming; hiding them until due risks forgetting them.

### The customer's branch defaults to the nearest, but their pick wins
**Decision.** The browser's location is asked once per page load; until the customer picks a branch, the nearest one is
selected. An explicit pick is remembered (`3k.branch`) and never overridden. Without location, the first branch.
**Why.** Most people want the closest branch, and asking them first slows the order down; but a deliberate choice (say,
near work) must stick.
**Trade-off.** Straight-line distance, not travel time.

### The branch map frames the branches, not a fixed centre
**Decision.** The landing map fits its view to all active branches (`fitBounds`), instead of a hard-coded centre and zoom.
**Why.** It opens on the middle of the branches as asked, and stays right when a branch is added or closed. The visitor's
own location is shown as a dot but does not move the framing.

---

## Security and access

### A role comes only from `app_metadata`, and no role means customer
**Why.** `user_metadata` can be edited by the user, so trusting it let anyone become admin. `app_metadata` is writable only
by the server. Defaulting to customer matches the database helper `auth_role()`, so the app and the policies agree.

### Shared employee passwords for the cashier and the kiosk
**Decision.** The cashier screen and the kiosk ask for one shared password (per branch), not personal accounts. The cashier
password is the branch's shared cashier account's password; the kiosk password is a hash that mints a per-device key bound
to the branch.
**Why.** The shop wants a screen anyone on shift can open without managing logins, and the kiosk is a public terminal.
**Trade-off.** Cash payments cannot be attributed to a person (they record the shared account). Accepted for now; per-cashier
names are the upgrade ([security.md](./security.md#known-gaps-and-accepted-risks)).

### Kiosk device keys, hashed and revocable
**Why.** A kiosk has no user. A per-device key says which terminal placed an order and can be revoked individually. It lives in
the browser, so it is a revocable identifier, not a true secret.

### Logout ends only the current device's session
**Why.** The cashier login is shared by every register; ending all sessions would sign every register out.

---

## Orders and money

### The server prices everything; money is whole centavos
**Why.** A browser can never name its own price. Whole centavos avoid floating-point drift.
The price paid is saved on each line so menu changes never rewrite history.

### Payment status is separate from order status
**Why.** Orders are often paid long before they finish (counter cash, kiosk GCash) or finished before they are paid (cash on
delivery). One field could not express both.

### GCash is manual, and only staff mark it paid
**Decision.** No payment provider. Customers pay the restaurant's own GCash account (QR, name and number from
the `NEXT_PUBLIC_GCASH_*` settings) and send a reference number and/or receipt; staff approve or reject it against the GCash app. At the
counter (walk-ins, and kiosk orders) the cashier checks the receipt and records the reference number.
**Why.** A PayMongo account was not available (October 2026). A reference number typed by the customer proves nothing on
its own, so it only ever puts the order *up for verification*.

### Never keep a customer's money without an answer
**Decision.** Voiding a paid GCash order moves it to **refund pending** until staff send the money back by hand and mark it
**refunded**; an order whose GCash payment is still waiting to be verified cannot be voided until someone looks; paying in
cash replaces a GCash submission still waiting.
**Why.** Each of these was a real way to lose or double-take a customer's money.

### First rider to claim wins
**Why.** Riders pull from a shared pool; a single guarded update means two riders cannot both get an order, and nobody has to
dispatch.

### Phone numbers are exactly 11 digits starting `09`
**Why.** It is the Philippine mobile format, riders dial it from a link, and one format avoids duplicates such as `0917…` vs
`+63917…`. Enforced in the form, the API and the database.
**Trade-off.** Landlines and foreign numbers are not accepted.

### Validation lives in three places with the same rules
**Decision.** Form (instant feedback), API (the real gate), database (a backstop for scripts). The rules are centralised in
`src/utils/validators/fields.ts`, mirrored in `src/utils/validation.ts`, and tabulated in
[data-dictionary.md](./data-dictionary.md#input-rules-the-same-everywhere).
**Trade-off.** A rule change touches several files; the table in the docs is the checklist.

### Order numbers restart each Manila day and are unique per day
**Why.** Staff read them aloud, so they should be short. They were globally unique at first, which meant the first order of
the next day collided with yesterday's and the channel could never issue another number. With branches they are also
counted per branch (see [Branches](#order-numbers-count-per-branch)).

---

## Chat and images

### Guests use a secret token and a content-free ping, not anonymous sign-in
**Decision.** The first message returns a random token the browser keeps (only its hash is stored); live delivery is a Broadcast
ping that triggers a fetch.
**Why.** Anonymous sign-in would allow plain row-level security but needs a dashboard setting, creates a user per visitor,
and still has to be rate-limited. The token approach needs no extra setup and exposes nothing even if the channel is overheard.

### Delivery chat is open only while the order is out for delivery
**Why.** It exists to coordinate a hand-over. Afterwards the history stays readable, but nobody can message a rider about a
finished order.

### Chat photos are private; menu photos are public
**Why.** Menu photos are marketing and benefit from caching and simple URLs. Chat photos are personal (a door, a receipt), so
they sit in a private bucket and are shown through links that expire, issued only to people in the conversation.
**Trade-off.** Links must be refreshed (the app does this on every fetch); deleting a conversation does not yet delete files.

### Guests may attach photos only after their first message, with tight limits
**Why.** Stops an anonymous visitor opening a conversation with an upload. Limits: 5 MB, three formats, 30 photos per
conversation, 10 per 10 minutes per guest.

### Photos are shrunk in the browser first
**Why.** Phone photos are large; shrinking before upload keeps the 5 MB limit practical and makes chat fast on mobile data
(a 7 MB photo becomes about 1 MB).

---

## Reporting

### A sale is paid and not voided or cancelled, counted when paid
**Why.** It is money actually collected on a live order. "Completed" would hide money taken before the kitchen finishes and
miss a day's takings at closing. A completed order cannot be voided, so a paid live order is never reversed. Voided orders still
awaiting a refund are a separate note, not revenue.

### Days are Manila days
**Why.** The business runs on Manila time. A 9pm order must be today's, not tomorrow's UTC date. Manila has no daylight saving,
so a fixed offset is exact.

### The report is a database function
**Why.** The data service returns at most 1,000 rows per request, which a busy month of orders and their items would exceed,
silently truncating totals. One SQL function returns the finished numbers. Only the server (secret key, through the sales-report server action) can run it.

### Hand-built charts
**Why.** Five simple charts do not justify a charting library's size, colours and animation to override. Each chart carries a text
label and the daily figures are available as a table, so nothing depends on colour alone.

---

## Frontend and design

### OpenStreetMap data with Leaflet, not Google Maps
**Why.** No API key, account or billing card; works immediately. Plain Leaflet because the React wrapper requires React 19
and the app is on 18; the pin is inline SVG so no marker image files need bundling. The map loads only when it is shown.
**Trade-off.** The free address lookup (Nominatim) is rate-limited (the app debounces) and sends the searched address to
OpenStreetMap.

### Minimal maps
**Decision.** Every map is pared down: pale tiles (OpenStreetMap, greyed out with a CSS filter),
zoom buttons tucked bottom-right, credits without the Leaflet prefix, and the app's own font in popups and labels. The
branch map is washed out to near-white, and each branch is a **red pin with the 3K Kitchen logo** (the one set in Site
images) in the white disc of its head, standing on a ring, so the branches are unmistakable; the customer's branch is
larger and labelled, the rest show their name on hover. Pins shrink on phone-width maps so nearby branches do not
overlap. The logo is an `<image>` inside the pin's SVG, clipped to the disc: Leaflet's stylesheet resizes ordinary
`<img>` elements in markers.
The delivery map keeps a full pin, since its point must be precise. All of it lives in `src/app/globals.css` and `src/view/components/mapPins.ts`.
**Why.** The map is the landing page's hero; the branches should be the only thing that stands out on it.

### OpenStreetMap tiles, greyed out, with no key
**Decision.** Every map uses the standard OpenStreetMap tiles with a grey CSS filter (set once in
`src/view/components/mapPins.ts`). CARTO's light tiles were supported until 2026-10-18 but needed a key that was never
set, so the grey OpenStreetMap look is what everyone saw; that look is now the only one.
**Why.** Free, no account or key, and the quiet style lets the red branch pins stand out.
**Trade-off.** OpenStreetMap's tile usage policy suits light traffic only. A busy site should move to a hosted tile
provider (one line in `mapPins.ts`).

### The pin is optional, and typed addresses always win
**Why.** Plenty of addresses are better typed; a pin is a precision aid for the rider. A field the customer typed is never
overwritten by a lookup.

### One Supabase client holds the session for every sign-in method
**Why.** Email, Google and the cashier gate all end in the same Supabase session, kept by the one browser client
(`src/utils/supabase.ts`), refreshed automatically and shared between tabs. Google's code is exchanged on
`/auth/callback` by that same client, so the old separate OAuth client (and its sign-out pitfall) is gone.

### Toasts at the top, one bottom dock for the cart bar and chat button
**Why.** Two things pinned to the same bottom spot overlapped. Stacking the persistent items in one flow layout guarantees
they never collide at any height; temporary messages go where nothing else lives.

### Toasts by sonner, with rich colours
**Decision.** Notifications use the `sonner` library (`<Toaster richColors />`, top centre under the header), behind the
existing `useToast()` hook, which simply returns sonner's `toast`.
**Why.** Tinted success and error toasts with icons, stacking, swipe to dismiss and accessible announcements, without
maintaining our own; keeping `useToast()` meant no page had to change.
**Trade-off.** One more dependency (small, no other dependencies of its own).

### Modern, minimal design that keeps the brand
**Decision.** Same logo, red/orange/ink palette and Poppins, but flat white surfaces with hairline borders, small radii, red only
for actions and prices, and the script font only for the wordmark and hero. Implemented as tokens in `index.css`, so screens
inherit it.

### Placeholder dish photos from openly licensed sources
**Why.** The menu needed images to be usable. Each photo's author and licence are recorded in
`supabase/seed-data/product-images.json`; replace them with your own, and credit them if the site is public until you do.

---

## Process

### Migrations are the source of truth, applied by hand in order
**Why.** The database should always equal "every migration applied". Applied migrations are never edited; fixes are new
migrations (the map-pin check was corrected this way).

### Tests run against the real database
**Why.** Row-level security, triggers and constraints are exactly what mocks hide. The cost is slower runs (about 8 minutes)
and the need to clean up.

### Documentation changes in the same commit as the code
See [README.md](./README.md#keeping-the-documentation-true).
