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
| **Kiosk** (`kiosk`) | The customer, at a terminal in the restaurant | Dine in, take out | Cash at the counter, or GCash on the spot (then it goes straight to the kitchen) |
| **Counter** (`pos`) | The cashier, for a walk-in | Dine in, take out | Cash or GCash at the counter |
| **Online** (`online`) | A logged-in customer on the website, from the branch they choose | Delivery or pickup, as soon as possible or scheduled | Cash on delivery / at pickup, or GCash before the kitchen starts |

Every order belongs to one branch: the kiosk's, the cashier's, or the one the online customer picked.

## How the pieces fit

```
   Browser (one React app, many screens)
   ┌───────────────────────────────────────────────────────────────┐
   │ Landing · Menu · Checkout · Orders · Profile   (customers)    │
   │ /cashier (POS)   /kiosk   /driver   /admin                    │
   └───────┬──────────────────────────────┬────────────────────────┘
           │ REST (all writes, all pricing)│ Realtime (live updates only)
           ▼                               ▼
   ┌───────────────────┐         ┌──────────────────────────────────┐
   │  Express API      │────────▶│  Supabase                        │
   │  validation,      │ secret  │  Postgres (data, RLS, SQL fns)   │
   │  roles, pricing,  │  key    │  Auth (logins, Google)           │
   │  payments, chat   │         │  Storage (menu + chat images)    │
   └───┬───────────┬───┘         │  Realtime (postgres_changes,     │
       │           │             │            broadcast)            │
       ▼           ▼             └──────────────────────────────────┘
   PayMongo    CARTO map tiles, OpenStreetMap address lookup (from the browser)
   (GCash)
```

Two rules shape everything:

1. **Browsers never write to the database.** Every change goes through the API, which checks who is asking and
   recalculates prices itself. The database only lets people *read* what they are entitled to, which is also what
   scopes the live updates they receive.
2. **The server is the authority.** A price, a total, a role or a payment state sent by a browser is ignored.

More in [architecture.md](./architecture.md) and [security.md](./security.md).

## Technology

| Layer | Choice |
| --- | --- |
| Frontend | React 18, Vite, Tailwind CSS v4, React Router, Leaflet (map), supabase-js (live updates and Google sign-in only) |
| Backend | Node ≥ 20, Express 4 (ES modules), zod (validation), helmet, cors, express-rate-limit |
| Database and platform | Supabase: Postgres, Row Level Security, Auth, Storage, Realtime |
| Payments | PayMongo (GCash), via payment intents and signed webhooks |
| Maps | Leaflet with CARTO light tiles (OpenStreetMap data) and Nominatim address search (no API key) |
| Tests | Node's built-in test runner against the real database |

## Repository layout

```
.
├── backend/                  Express API
│   ├── src/                  routes → controllers → services (see architecture.md)
│   ├── supabase/
│   │   ├── migrations/       the database schema, applied in filename order
│   │   ├── seed-data/        menu.json and product-images.json
│   │   └── seed.sql          the menu, generated from menu.json
│   ├── scripts/              seeding, test runner, verification scripts
│   └── tests/                unit, integration, end-to-end
├── frontend/                 React app
│   ├── src/pages/            one folder per audience (customer, cashier, kiosk, driver, admin)
│   ├── src/components/       shared pieces (chat, map, dialogs, buttons…)
│   ├── src/lib/              API client, session, live updates, validation, formatting
│   └── public/brand/         the logo and promo image bundled as defaults
├── docs/                     this documentation
└── .mcp.json                 Supabase MCP server address (no credentials)
```

## Current status

**Working and tested** (525 automated tests, plus browser checks of the main flows): all three ordering channels,
cash and counter payments, the full order lifecycle, rider delivery with cash on delivery, the kiosk, chat with
photos, profiles, Google sign-in, per-product photos, delivery map pins, the sales dashboard, validation and
security hardening, multiple branches with branch-scoped admins, the branch map, nearest-branch ordering, per-branch
sold out and scheduled orders.

**Built but not yet proven against the live service:**

- **GCash.** The whole flow is implemented and tested against a fake PayMongo server, but no real PayMongo account
  has been connected. See [deployment.md](./deployment.md#gcash-paymongo).

**Known gaps** are listed in [data-dictionary.md](./data-dictionary.md#known-gaps) and
[security.md](./security.md#known-gaps-and-accepted-risks).
