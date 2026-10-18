# Overview

## What this is

An ordering system for **3K Kitchen**, a Filipino restaurant with **seven branches in Cavite** (GMA Terminal, Dasma
Bayan, Langkaan, Gen-Tri, Trece, Silang and Imus). One system serves every branch, every way a customer can order, and
every person who handles the order afterwards:

- **Customers** find a branch on the map, order from it on the website (pickup or delivery, now or **scheduled for
  later**), pay in cash or by GCash, and follow their order live. With location allowed, the nearest branch is chosen
  for them.
- **Walk-in customers** order themselves at a **self-order kiosk** in a branch.
- **The cashier** of each branch rings up counter orders, takes payments, and runs that branch's kitchen queue, with
  scheduled orders highlighted.
- **Riders** deliver for one branch: they pick up its delivery orders and collect cash on delivery.
- **Branch admins** manage the branches they are assigned to (one or several): orders, sales, riders, kiosks,
  employee passwords and what is sold out. They cannot see any other branch.
- **The super admin** manages everything: every branch, adding branches, the shared menu and prices, admin accounts and
  the site images.
- **Anyone**, with or without an account, can **chat with the cashier** from the website, and customers can **chat
  with their rider**. Both chats support photos.

## The people and the screens

| Who | Screen | Address | How they sign in |
| --- | --- | --- | --- |
| Visitor (no account) | Landing page with the menu and chat | `/` | Not needed until checkout |
| Customer | Menu, checkout, orders, profile | `/menu`, `/checkout`, `/orders`, `/profile` | Email and password, or Google |
| Cashier | Point of sale | `/cashier` | Pick the branch, then that branch's shared employee **password** (no email) |
| Kiosk | Self-order terminal | `/kiosk` | Pick the branch, then that branch's kiosk **password**, once per browser |
| Rider | Delivery screen | `/driver` | Email and password |
| Admin (branch) | Management area for their branches | `/admin` | Email and password |
| Super admin | Management area for every branch | `/admin` | Email and password |

How to use each is in [user-guide.md](./user-guide.md).

## Three ways to order

| Channel | Who places it | Fulfilment | Payment |
| --- | --- | --- | --- |
| **Kiosk** (`kiosk`) | The customer, at a terminal in the restaurant | Dine in, take out | Cash at the counter, or GCash by scanning the QR on screen (then the receipt is shown to the cashier) |
| **Counter** (`pos`) | The cashier, for a walk-in | Dine in, take out | Cash or GCash at the counter |
| **Online** (`online`) | A logged-in customer on the website, from the branch they choose | Delivery or pickup, as soon as possible or scheduled | Cash on delivery / at pickup, or GCash (reference number or receipt, verified by staff) |

Every order belongs to one branch: the kiosk's, the cashier's, or the one the online customer picked.

## How the pieces fit

```
   Next.js app (one app, many screens)
   ┌───────────────────────────────────────────────────────────────┐
   │ Landing · Menu · Checkout · Orders · Profile   (customers)    │
   │ /cashier (POS)   /kiosk   /driver   /admin                    │
   │ screens ─▶ controllers ─▶ models  (in the browser)            │
   │ server actions: gates, kiosk, guest chat, staff, sales        │
   └───────┬──────────────────────────────┬────────────────────────┘
           │ reads and writes as the user  │ secret key (server actions only)
           ▼                               ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  Supabase                                                    │
   │  Postgres: data, row-level security per role and branch,     │
   │            triggers that own prices, totals, payment status  │
   │  Auth (logins, Google) · Storage (menu, chat, receipts)      │
   │  Realtime (postgres_changes, broadcast)                      │
   └──────────────────────────────────────────────────────────────┘
   The browser also loads OpenStreetMap map tiles and address lookups directly.
```

Two rules shape everything:

1. **The database is the authority.** There is no API server: browsers read and write Supabase directly, and every
   write must pass a policy for that role and branch. A price, a total, a role or a payment state sent by a browser is
   ignored; triggers take them from the menu and the items. The same policies scope the live updates each person
   receives.
2. **The secret key never reaches a browser.** The few things that need it run as server actions inside the Next.js
   app.

More in [architecture.md](./architecture.md) and [security.md](./security.md).

## Technology

| Layer | Choice |
| --- | --- |
| App | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Leaflet (map), supabase-js, zod (validation), sonner (toasts) |
| Server code | Next.js server actions (the only place the secret key is used) |
| Database and platform | Supabase: Postgres, Row Level Security, Auth, Storage, Realtime |
| Payments | Cash, and manual GCash into the restaurant's own account (staff verify the reference number / receipt) |
| Maps | Leaflet with OpenStreetMap tiles (greyed out) and Nominatim address search, no API key |
| Checks | `npm run check:flows`: the app's controllers and server actions run end to end against the database |

## Repository layout

```
.
├── src/                      the Next.js app (see architecture.md)
│   ├── app/                  routes, one folder per URL
│   ├── controllers/          business rules; server/ holds the server actions
│   ├── models/               Supabase queries; server/ uses the secret key
│   ├── view/                 components/ (shared UI) and presentation/<feature>/ (screens)
│   ├── context/ hooks/       session, cart, live updates, shared state
│   └── utils/                validation, formatting, Supabase clients
├── supabase/
│   ├── migrations/           the database schema, applied in filename order
│   ├── seed-data/            menu.json and product-images.json
│   └── seed.sql              the menu, generated from menu.json
├── scripts/                  the end-to-end flow checks (npm run check:flows)
├── public/brand/             the logo bundled as the default, the GCash QR
├── docs/                     this documentation
└── .mcp.json                 Supabase MCP server address (no credentials)
```

## Current status

**Working and checked** (61 end-to-end flow checks against the database; the screens moved over from the earlier React app unchanged): all three ordering channels,
cash and counter payments, the full order lifecycle, rider delivery with cash on delivery, the kiosk, chat with
photos, profiles, Google sign-in, per-product photos, delivery map pins, the sales dashboard, validation and
security hardening, multiple branches with branch-scoped admins, the branch map, nearest-branch ordering, per-branch
sold out and scheduled orders.

**Known gaps** are listed in [data-dictionary.md](./data-dictionary.md#known-gaps) and
[security.md](./security.md#known-gaps-and-accepted-risks).
