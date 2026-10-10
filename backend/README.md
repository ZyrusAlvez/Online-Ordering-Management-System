# Backend

Node/Express REST API for the 3K Kitchen ordering system, backed by Supabase (Postgres, Auth, Storage).
Full documentation lives in [`../docs`](../docs/README.md); this page is the short version.

## Run

```bash
npm install
cp .env.example .env      # fill in the Supabase URL and keys (see ../docs/deployment.md for every setting)
npm run dev               # http://localhost:4000/api/v1, restarts on change (Node >= 20)
```

You need a Supabase project with the migrations applied first: [getting-started](../docs/getting-started.md).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `npm start` | API with / without file watching |
| `npm test` | All 525 tests (unit, integration, end-to-end) against your Supabase project |
| `npm run test:unit` / `test:integration` / `test:e2e` / `test:coverage` | One layer, or coverage |
| `npm run seed:accounts` | Create or reset the super admin, GMA cashier and GMA kiosk passwords |
| `node --env-file=.env scripts/dev/seed-test-users.mjs` | Test customers, riders, and the Imus admin and cashier |
| `npm run seed:menu` | Regenerate `supabase/seed.sql` from `supabase/seed-data/menu.json` |
| `npm run seed:brand` | Upload the bundled logo to Storage |
| `npm run seed:product-images` | Placeholder photos for every dish |
| `node --env-file=.env scripts/dev/check-rls.mjs` | Check what each role (and each branch's staff) is allowed to read |

## Layout

```
src/
  routes/       path + middleware + controller, nothing else
  controllers/  HTTP in and out
  services/     business rules and all database access
  validators/   zod schemas (fields.js has the shared field rules)
  middleware/   auth and roles, branch scope, kiosk keys, uploads, errors
  config/       validated environment, Supabase clients
  constants/    statuses and allowed moves
  utils/        helpers (branchScope: who sees which branch; schedule: order times)
supabase/       migrations (applied in order), menu seed data
scripts/        seeding, test runner, verification scripts
tests/          unit, integration, e2e
```

Routes never contain queries and services never touch `req`/`res`. Where a change belongs, how requests flow, and the
database conventions: [architecture](../docs/architecture.md). Every endpoint: [api](../docs/api.md).

## Where to read more

[how-it-works](../docs/how-it-works.md) (business rules) · [data-dictionary](../docs/data-dictionary.md) ·
[security](../docs/security.md) · [testing](../docs/testing.md) · [operations](../docs/operations.md)
