# Design decisions

The significant choices, each with the reason, so nobody has to rediscover it (or undo it by accident). Format:
**Decision**, **Why**, **Trade-off**. Add an entry whenever you make a choice you would have to explain again.

**Contents:** [Architecture](#architecture) · [Branches](#branches) · [Security and access](#security-and-access) · [Orders and money](#orders-and-money) ·
[Chat and images](#chat-and-images) · [Reporting](#reporting) · [Frontend and design](#frontend-and-design) ·
[Process](#process)

---

## Architecture

### One route namespace per interface
**Decision.** `/kiosk`, `/pos`, `/orders`, `/rider`, `/admin` rather than one `/orders` that behaves differently per caller.
**Why.** Each app then has one contract that can be documented and tested; route files read as a table of contents.
**Trade-off.** A little repetition between namespaces.

### Layered backend: routes → controllers → services
**Decision.** Routes only route, controllers only translate HTTP, services hold rules and all database access.
**Why.** Rules live in one place and can be tested without HTTP; changes have an obvious home ([architecture.md](./architecture.md#where-does-my-change-go)).

### Browsers never write to the database
**Decision.** All writes go through the API using the secret key. Database policies are `SELECT`-only.
**Why.** Pricing, state moves and role checks must be enforced where the browser cannot bypass them. Row-level security is
kept on anyway because live updates obey it: the policies decide what each person's live feed contains.
**Trade-off.** Every change needs an endpoint. An earlier version let customers insert and update their own orders
directly, which allowed free and self-"paid" orders ([security.md](./security.md#issues-found-and-fixed)).

### The supabase-js client in the browser is for live updates (and Google sign-in) only
**Why.** Keeps one path for data (the API) and makes it impossible for a screen to skip validation by writing directly.

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
**Why.** A register and a kiosk physically belong to one branch, and the API then scopes them without any per-request
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
`backend/src/utils/schedule.js` and `frontend/src/lib/schedule.js`, so the checkout offers only slots the API accepts.
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
by the server. Defaulting to customer matches the database helper `auth_role()`, so the API and the policies agree.

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
**Why.** A browser can never name its own price. Whole centavos avoid floating-point drift, and PayMongo bills in centavos anyway.
The price paid is saved on each line so menu changes never rewrite history.

### Payment status is separate from order status
**Why.** Orders are often paid long before they finish (counter cash, kiosk GCash) or finished before they are paid (cash on
delivery). One field could not express both.

### Only PayMongo's signed notification marks an order paid
**Why.** Returning to the site after GCash can be faked or never happen. Notifications are verified, recorded by id so repeats
do nothing, and **retried by the provider if processing fails** (the record is removed on failure so the retry is not mistaken
for a duplicate).

### Never keep a customer's money without an answer
**Decision.** Voiding a paid GCash order retries a failed refund and refuses to void while money is held; late payments on
voided orders are refunded automatically; starting GCash again cancels the earlier attempt.
**Why.** Each of these was a real way to lose or double-take a customer's money found in review.

### First rider to claim wins
**Why.** Riders pull from a shared pool; a single guarded update means two riders cannot both get an order, and nobody has to
dispatch.

### Phone numbers are exactly 11 digits starting `09`
**Why.** It is the Philippine mobile format, riders dial it from a link, and one format avoids duplicates such as `0917…` vs
`+63917…`. Enforced in the form, the API and the database.
**Trade-off.** Landlines and foreign numbers are not accepted.

### Validation lives in three places with the same rules
**Decision.** Form (instant feedback), API (the real gate), database (a backstop for scripts). The rules are centralised in
`backend/src/validators/fields.js`, mirrored in `frontend/src/lib/validation.js`, and tabulated in
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
silently truncating totals. One SQL function returns the finished numbers. Only the API (secret key) can run it.

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

### CARTO light tiles on every map
**Decision.** All maps draw CARTO's light basemap (OpenStreetMap data, *Positron* style), set once in
`frontend/src/components/mapPins.js`.
**Why.** A quiet, pale map keeps attention on the red branch pins and fits the warm, minimal design; the default
OpenStreetMap style is busy and colourful.
**Trade-off.** CARTO requires a (free) key, `VITE_CARTO_BASEMAPS_KEY`, with a monthly request allowance, and sees which
area is viewed. Without the key the maps fall back to standard OpenStreetMap tiles rather than CARTO's "API KEY
REQUIRED" placeholders. Swapping providers is a one-file change ([deployment.md](./deployment.md)).

### The pin is optional, and typed addresses always win
**Why.** Plenty of addresses are better typed; a pin is a precision aid for the rider. A field the customer typed is never
overwritten by a lookup.

### The app owns its session; Google sign-in uses a separate client
**Why.** One session shape and one refresh path for every sign-in method, shared between tabs, refreshed before it expires, and
ended only when the server rejects it. The Google client must never call sign-out, which ends the session just handed over.

### Toasts at the top, one bottom dock for the cart bar and chat button
**Why.** Two things pinned to the same bottom spot overlapped. Stacking the persistent items in one flow layout guarantees
they never collide at any height; temporary messages go where nothing else lives.

### Modern, minimal design that keeps the brand
**Decision.** Same logo, red/orange/ink palette and Poppins, but flat white surfaces with hairline borders, small radii, red only
for actions and prices, and the script font only for the wordmark and hero. Implemented as tokens in `index.css`, so screens
inherit it.

### Placeholder dish photos from openly licensed sources
**Why.** The menu needed images to be usable. Each photo's author and licence are recorded in
`backend/supabase/seed-data/product-images.json`; replace them with your own, and credit them if the site is public until you do.

---

## Process

### Migrations are the source of truth, applied by hand in order
**Why.** The database should always equal "every migration applied". Applied migrations are never edited; fixes are new
migrations (the map-pin check was corrected this way).

### Tests run against the real database, with a fake PayMongo
**Why.** Row-level security, triggers and constraints are exactly what mocks hide. PayMongo cannot be called without live
credentials, so a recording fake server stands in for it. The cost is slower runs (about 3 minutes) and the need to clean up.

### Documentation changes in the same commit as the code
See [README.md](./README.md#keeping-the-documentation-true).
