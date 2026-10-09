# 3K Kitchen Ordering System

Online, kiosk and counter ordering for **3K Kitchen** and its branches in Cavite: one system for customers, each
branch's cashier and riders, branch admins and the super admin, with a map of the branches (the nearest one chosen for
you), scheduled orders, live order updates, GCash and cash payments, delivery with a map pin, chat (with photos)
between guests and a branch's cashier and between customers and riders, and a sales dashboard per branch.

| | |
| --- | --- |
| **Frontend** | React + Vite + Tailwind, one app for every screen (`frontend/`) |
| **Backend** | Node + Express REST API (`backend/`) |
| **Platform** | Supabase (Postgres, Auth, Storage, Realtime), PayMongo for GCash, OpenStreetMap for maps |

## Quick start

```bash
# 1. Create a Supabase project, apply backend/supabase/migrations/* in order, run backend/supabase/seed.sql
# 2. Backend
cd backend && npm install && cp .env.example .env     # fill in the Supabase URL and keys
node --env-file=.env scripts/seed-accounts.mjs         # super admin, GMA cashier and GMA kiosk passwords
npm run dev                                            # http://localhost:4000/api/v1
# 3. Frontend (second terminal)
cd frontend && npm install && cp .env.example .env     # API URL and Supabase URL + publishable key
npm run dev                                            # http://localhost:5173
```

The full walk-through, including the database, optional Google sign-in and GCash, is in
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
| [architecture](docs/architecture.md) | The code, live updates, sign-in, migrations |
| [api](docs/api.md) | Every endpoint |
| [data-dictionary](docs/data-dictionary.md) | Every table, field and rule |
| [security](docs/security.md) | Protections, issues fixed, known gaps, go-live checklist |
| [testing](docs/testing.md) · [manual](docs/testing-manual.md) | The 525-test suite and hand testing |
| [deployment](docs/deployment.md) | Settings, hosting, going live |
| [operations](docs/operations.md) | Running it day to day, troubleshooting |
| [decisions](docs/decisions.md) · [changelog](docs/changelog.md) | Why it is built this way, and what changed |

## Repository layout

```
backend/    Express API, database migrations, seed scripts, tests
frontend/   React app
docs/       documentation
.mcp.json   Supabase MCP server address (no credentials)
```

> **Development credentials** are written in [docs/test-accounts.md](docs/test-accounts.md). Keep this repository private
> and change them before going live ([security checklist](docs/security.md#before-going-live)).
