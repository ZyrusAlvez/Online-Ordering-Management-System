# Getting started

How to take a fresh checkout to a running system on your own machine. Allow about 30 minutes, most of it creating
the Supabase project and applying the database.

**You need**

- Node.js 20 or newer (the project is developed on 22) and npm
- A free [Supabase](https://supabase.com) project
- Optional, only for the features that need them: a Google Cloud project (Google sign-in) and a PayMongo account
  (GCash). Everything else, including all cash flows, works without them.

---

## 1. Create the Supabase project

In the Supabase dashboard create a project, then open **Project Settings → API** and note three values:

| Value | Looks like | Notes |
| --- | --- | --- |
| Project URL | `https://abcdefgh.supabase.co` | |
| Publishable key | `sb_publishable_…` | Safe for browsers |
| Secret key | `sb_secret_…` | **Server only.** Never put it in the frontend or in git |

## 2. Create the database

The schema is a series of SQL files in `backend/supabase/migrations/`. **Apply them all, in filename order.**
Open the Supabase **SQL Editor**, paste each file in turn and run it (or use the Supabase CLI if you prefer).

| # | File | What it adds |
| --- | --- | --- |
| 1 | `20260903000000_init_schema.sql` | Menu tables (categories, products, variants), orders and items, first policies |
| 2 | `20260912000000_multichannel_orders.sql` | Channels (kiosk, counter, online), order numbers, profiles and roles, payments, kiosk devices, webhook log, row-level security, live updates |
| 3 | `20260912010000_harden_functions.sql` | Locks down the database functions |
| 4 | `20260912020000_revoke_function_execute_from_public.sql` | Closes the functions to the public |
| 5 | `20260920000000_employee_credentials.sql` | Hashed kiosk password |
| 6 | `20260921000000_menu_images_storage.sql` | Public `menu-images` bucket and the site images table |
| 7 | `20260922000000_chat.sql` | Chat conversations and messages |
| 8 | `20260923000000_profile_address.sql` | Saved delivery address; closes direct profile edits |
| 9 | `20260924000000_chat_guest_number.sql` | `Guest-1023` style guest numbers |
| 10 | `20260925000000_validation_and_hardening.sql` | Phone and length rules, one-cash-payment rule, closes direct order writes, order numbers per day |
| 11 | `20260925010000_fix_pin_constraints.sql` | Corrects the map-pin check |
| 12 | `20260926000000_sales_report.sql` | The sales report function |
| 13 | `20260927000000_chat_images.sql` | Private `chat-images` bucket and photo messages |
| 14 | `20261010000000_super_admin_role.sql` | The `super_admin` role (its own file: a new enum value cannot be used in the transaction that adds it) |
| 15 | `20261010010000_branches.sql` | The seven branches, staff-to-branch links, a branch on every order, kiosk, chat and kiosk password, per-branch order numbers, branch-scoped policies and sales report; promotes admins to super admin |
| 16 | `20261010010100_has_branch_access_anon.sql` | Lets anonymous reads evaluate the branch check (they get no rows instead of an error) |
| 17 | `20261010010200_has_branch_access_invoker.sql` | Runs the branch check with the caller's own rights |
| 18 | `20261010020000_branch_availability.sql` | Sold out at one branch |
| 19 | `20261010030000_scheduled_orders.sql` | Scheduled online orders |
| 20 | `20261011000000_remove_promo_image.sql` | Removes the promo photo: the logo is the only site image |

Then load the menu: run `backend/supabase/seed.sql` in the same editor. It is safe to run twice. It is generated from
`backend/supabase/seed-data/menu.json`; to change the menu, edit that file and run `npm run seed:menu` in `backend/`
to regenerate it (or just use the Menu page in the admin area once the app is running).

> Each migration file starts with a comment explaining why it exists. Read them if you want the reasoning.

## 3. Configure the backend

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and fill in at least:

```
SUPABASE_URL=https://abcdefgh.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
SUPABASE_SECRET_KEY=sb_secret_…
```

Everything else has a sensible default for development. The full list is in
[deployment.md](./deployment.md#environment-variables). The server checks the file when it starts and says exactly
what is wrong if something is missing.

## 4. Configure the frontend

```bash
cd frontend
npm install
cp .env.example .env
```

```
VITE_API_URL=http://localhost:4000/api/v1
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
```

Use the **publishable** key here, never the secret one. Optionally set `VITE_MAP_DEFAULT_LAT` and
`VITE_MAP_DEFAULT_LNG` for where the delivery-address map opens (it defaults to General Mariano Alvarez, Cavite). The
landing-page branch map needs no setting: it frames whatever branches exist.

## 5. Create the logins

The super admin, GMA Terminal's cashier and GMA Terminal's kiosk all need a password before anyone can sign in:

```bash
cd backend
SEED_ADMIN_PASSWORD='choose-one' SEED_CASHIER_PASSWORD='choose-one' SEED_KIOSK_PASSWORD='choose-one' \
  node --env-file=.env scripts/seed-accounts.mjs
```

- Leave the `SEED_…` variables out and it **generates** strong passwords, prints them once, and saves them to `.env`.
- It is safe to run again; it re-applies the password in `.env` so the account and the file can never disagree.
- The cashier and kiosk are *passwords only* (no email), per branch. The super admin is `admin@3k.local` unless you set
  `SEED_ADMIN_EMAIL`. The other branches' cashier and kiosk passwords are set from Admin → **Employee passwords** (the
  first cashier password for a branch creates its register login).
- Give the branches their real address, phone and hours in Admin → **Branches**; the migration seeds the seven
  branches with their map locations and 08:00–21:00.

For development and testing you also want the sample customers, riders and a second branch's admin and cashier
(Imus):

```bash
node --env-file=.env scripts/dev/seed-test-users.mjs
```

The resulting logins are listed in [test-accounts.md](./test-accounts.md).

## 6. Optional: photos

```bash
npm run seed:brand            # uploads the bundled logo to Storage
npm run seed:product-images   # gives every dish a placeholder photo (openly licensed, see seed-data/product-images.json)
```

Both only fill in what is still empty, so they never overwrite a photo you uploaded. Replace any of them later from
the admin area.

## 7. Run it

Two terminals:

```bash
cd backend  && npm run dev      # API on http://localhost:4000/api/v1
cd frontend && npm run dev      # app on http://localhost:5173
```

Check the API is alive: `curl localhost:4000/api/v1/health` should answer `{"status":"ok",…}`.
Open <http://localhost:5173>. Each screen's address is in [overview.md](./overview.md#the-people-and-the-screens).

> The backend port (4000) and the frontend port (5173) are what the CORS settings and the GCash return addresses
> assume. If you change them, change `CORS_ORIGIN`, `PUBLIC_APP_URL` and `KIOSK_RETURN_URL` too.

## 8. Check everything works

```bash
cd backend && npm test          # 525 tests, about 8 minutes, against your real Supabase project
```

It needs the logins from step 5. See [testing.md](./testing.md) for what it does to your database (it cleans up after
itself) and [test-accounts.md](./test-accounts.md) for trying the app by hand.

---

## Optional: Google sign-in

The "Continue with Google" button works once Google is enabled in Supabase.

1. **Google Cloud Console** → create or choose a project → **Google Auth Platform**. Set up the consent screen
   first (app name, your email, audience *External*).
2. **Clients → Create client** → type *Web application*. Under *Authorized redirect URIs* add
   `https://<your-project-ref>.supabase.co/auth/v1/callback`. Copy the **Client ID** and **Client secret**.
3. **Supabase dashboard → Authentication → Sign In / Providers → Google**: enable it and paste both values.
4. **Supabase → Authentication → URL Configuration → Redirect URLs**: add `http://localhost:5173/auth/callback`
   (and your real site's `/auth/callback` when you deploy).
5. While the Google app is in *Testing*, only addresses listed under **Audience → Test users** can sign in. Click
   **Publish app** to open it to everyone (basic sign-in needs no review).

Google accounts become ordinary customers. They never get staff roles.

## Optional: GCash

Needs a PayMongo account; see [deployment.md](./deployment.md#gcash-paymongo). Without it the server starts normally
and only the GCash buttons answer "not configured".

---

## Everyday commands

| Where | Command | What it does |
| --- | --- | --- |
| `backend/` | `npm run dev` | API with auto-restart on file changes |
| | `npm start` | API without file watching |
| | `npm test` | Everything (525 tests) |
| | `npm run test:unit` / `test:integration` / `test:e2e` | One layer (about 1 s / 7 min / 40 s) |
| | `npm run test:coverage` | Everything, with coverage |
| | `npm run seed:accounts` | Create or reset the super admin, GMA cashier and GMA kiosk passwords |
| | `npm run seed:menu` | Regenerate `seed.sql` from `menu.json` |
| | `npm run seed:brand` | Upload the logo |
| | `npm run seed:product-images` | Placeholder dish photos |
| | `node --env-file=.env scripts/dev/check-rls.mjs` | Check each role sees only what it should |
| `frontend/` | `npm run dev` | App with hot reload |
| | `npm run build` | Production build into `dist/` |
| | `npm run preview` | Serve the production build locally |

Something not working? See [operations.md](./operations.md#troubleshooting).
