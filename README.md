# 3K Kitchen Ordering System

Online, kiosk and counter ordering for **3K Kitchen** and its branches in Cavite: one system for customers, each
branch's cashier and riders, branch admins and the super admin, with a map of the branches (the nearest one chosen for
you), scheduled orders, live order updates, GCash and cash payments, delivery with a map pin, chat (with photos)
between guests and a branch's cashier and between customers and riders, and a sales dashboard per branch.

| | |
| --- | --- |
| **App** | Next.js (App Router) + TypeScript + Tailwind, one app for every screen, MVC in `src/` |
| **Backend** | Supabase only: Postgres (with RLS and triggers), Auth, Storage, Realtime. No separate API server |
| **Maps** | OpenStreetMap tiles and address search (free, no key) |

## Quick start

```bash
# 1. Create a Supabase project, apply supabase/migrations/* in order, run supabase/seed.sql
# 2. The app
npm install
cp .env.example .env.local        # Supabase URL, publishable key, secret key, GCash account
npm run seed:test-users           # optional, new projects only: the sample logins in docs/test-accounts.md
npm run dev                       # http://localhost:5173
```

A new Supabase project also needs its first super admin (one SQL statement). The full walk-through, including
the database, optional Google sign-in and GCash, is in
**[docs/getting-started.md](docs/getting-started.md)**.

## Documentation

Everything is in **[`docs/`](docs/README.md)**:

| | |
| --- | --- |
| [overview](docs/overview.md) | What it is, who uses it, how the pieces fit |
| [getting-started](docs/getting-started.md) | Set it up and run it |
| [user-guide](docs/user-guide.md) | How to use it, role by role |
| [test-accounts](docs/test-accounts.md) | Every login and a test walkthrough |
| [how-it-works](docs/how-it-works.md) | The business rules: branches, orders, scheduling, payments, delivery, chat, sales |
| [architecture](docs/architecture.md) | The MVC layout, where each rule is enforced, sign-in, live updates |
| [api](docs/api.md) | The controllers and server actions screens call |
| [data-dictionary](docs/data-dictionary.md) | Every table, field and rule |
| [security](docs/security.md) | Protections, issues fixed, known gaps, go-live checklist |
| [testing](docs/testing.md) | The flow checks and hand testing |
| [deployment](docs/deployment.md) | Settings, hosting, going live |
| [operations](docs/operations.md) | Running it day to day, troubleshooting |
| [decisions](docs/decisions.md) · [changelog](docs/changelog.md) | Why it is built this way, and what changed |

## Repository layout

```
src/         the Next.js app: app/ (routes), controllers/, models/, view/, context/, hooks/, utils/
supabase/    database migrations, seed SQL and seed data
scripts/     seed scripts and the end-to-end flow checks
public/      static files (logo, GCash QR)
docs/        documentation
.mcp.json    Supabase MCP server address (no credentials)
```

> **Development credentials** are written in [docs/test-accounts.md](docs/test-accounts.md). Keep this repository private
> and change them before going live ([security checklist](docs/security.md#before-going-live)).
