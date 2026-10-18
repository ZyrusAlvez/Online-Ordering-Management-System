# 3K Kitchen Ordering System

Online, kiosk and counter ordering for **3K Kitchen**'s seven branches in Cavite: customers, each branch's cashier and
riders, branch admins and a super admin. Branch map with the nearest branch, scheduled orders, live updates, cash and
manual GCash, delivery with map pins, chat with photos, and sales per branch.

| | |
| --- | --- |
| App | Next.js (App Router) + TypeScript + Tailwind, MVC in `src/` |
| Backend | Supabase only: Postgres (RLS + triggers), Auth, Storage, Realtime |
| Maps | OpenStreetMap tiles and address search (no key) |

## Quick start

```bash
npm install
cp .env.example .env.local    # Supabase URL, publishable key, secret key, GCash account
npm run dev                   # http://localhost:5173
```

A new Supabase project needs the migrations, the menu seed and a first super admin: see [docs/setup.md](docs/setup.md).

## Docs

| | |
| --- | --- |
| [setup](docs/setup.md) | Install, database, settings, hosting, go-live, day-to-day tasks, troubleshooting |
| [credentials](docs/credentials.md) | Every development login |
| [how-it-works](docs/how-it-works.md) | Business rules and how each role uses it |
| [architecture](docs/architecture.md) | Code layout, who enforces what, callable functions, design decisions |
| [database](docs/database.md) | Tables, field rules, access rules |
| [security](docs/security.md) | Controls, rate limits, fixed issues, known gaps |
| [testing](docs/testing.md) | `check:flows` and testing by hand |
| [changelog](docs/changelog.md) | What changed |

## Layout

```
src/        app/ (routes), controllers/, models/, view/, context/, hooks/, utils/
supabase/   migrations, menu seed
scripts/    end-to-end checks (npm run check:flows)
public/     logo, GCash QR
docs/       documentation
```

> Development logins are in [docs/credentials.md](docs/credentials.md). Keep this repository private and change them
> before going live.
