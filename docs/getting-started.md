# Getting started

From nothing to the app running on your machine: the Supabase project, the database, the settings, the logins, and
the optional extras (photos, Google sign-in, GCash). Production hosting is in [deployment.md](./deployment.md).

You need **Node.js 20 or newer** and a **Supabase** account.

---

## 1. Create the Supabase project

In the Supabase dashboard create a project, then open **Project Settings → API** and note three values:

| Value | Looks like | Notes |
| --- | --- | --- |
| Project URL | `https://abcdefgh.supabase.co` | |
| Publishable key | `sb_publishable_…` | Safe for browsers |
| Secret key | `sb_secret_…` | **Server only.** Never in a `NEXT_PUBLIC_` variable, never in git |

## 2. Create the database

The schema is a series of SQL files in `supabase/migrations/`. **Apply them all, in filename order.** Open the
Supabase **SQL Editor**, paste each file in turn and run it (or use the Supabase CLI).

| # | File | What it adds |
| --- | --- | --- |
| 1 | `20260903000000_init_schema.sql` | Menu tables (categories, products, variants), orders and items, first policies |
| 2 | `20260912000000_multichannel_orders.sql` | Channels (kiosk, counter, online), order numbers, profiles and roles, payments, kiosk devices, row-level security, live updates |
| 3 | `20260912010000_harden_functions.sql` | Locks down the database functions |
| 4 | `20260912020000_revoke_function_execute_from_public.sql` | Closes the functions to the public |
| 5 | `20260920000000_employee_credentials.sql` | Hashed kiosk password |
| 6 | `20260921000000_menu_images_storage.sql` | Public `menu-images` bucket and the site images table |
| 7 | `20260922000000_chat.sql` | Chat conversations and messages |
| 8 | `20260923000000_profile_address.sql` | Saved delivery address |
| 9 | `20260924000000_chat_guest_number.sql` | `Guest-1023` style guest numbers |
| 10 | `20260925000000_validation_and_hardening.sql` | Phone and length rules, one-cash-payment rule, order numbers per day |
| 11 | `20260925010000_fix_pin_constraints.sql` | Corrects the map-pin check |
| 12 | `20260926000000_sales_report.sql` | The sales report function |
| 13 | `20260927000000_chat_images.sql` | Private `chat-images` bucket and photo messages |
| 14 | `20261010000000_super_admin_role.sql` | The `super_admin` role (its own file: a new enum value cannot be used in the transaction that adds it) |
| 15 | `20261010010000_branches.sql` | The seven branches, staff-to-branch links, a branch on every order, kiosk, chat and kiosk password, per-branch order numbers, branch-scoped policies and sales report |
| 16 | `20261010010100_has_branch_access_anon.sql` | Lets anonymous reads evaluate the branch check |
| 17 | `20261010010200_has_branch_access_invoker.sql` | Runs the branch check with the caller's own rights |
| 18 | `20261010020000_branch_availability.sql` | Sold out at one branch |
| 19 | `20261010030000_scheduled_orders.sql` | Scheduled online orders |
| 20 | `20261011000000_remove_promo_image.sql` | The logo is the only site image |
| 21 | `20261012000000_manual_gcash.sql` | Manual GCash: reference number, receipt, verifier; private `payment-receipts` bucket |
| 22 | `20261012000100_drop_paymongo.sql` | Drops the PayMongo columns and the webhook log |
| 23 | `20261018000000_nextjs_client_writes.sql` | The browser's write policies, storage policies, and the triggers that keep prices, totals and payment status honest |
| 24 | `20261018000100_order_total_definer.sql` | The order total is summed with owner rights (a rider claiming an order used to reset it to 0) |
| 25 | `20261018000200_tighten_function_grants.sql` | Removes two unneeded function grants |

Then load the menu: run `supabase/seed.sql` in the same editor (safe to run twice). It is generated from
`supabase/seed-data/menu.json`; to change the menu, edit that file and run `npm run seed:menu`, or just use the admin
Menu page once the app is running.

## 3. Configure the app

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local` (every setting is explained in [deployment.md](./deployment.md#environment-variables)):

| Setting | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | The project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The publishable key |
| `SUPABASE_SECRET_KEY` | The secret key (only server actions and scripts read it) |
| `NEXT_PUBLIC_GCASH_*` | Optional, see [GCash](#gcash) |

## 4. Create the logins

The demo project already has every login in [test-accounts.md](./test-accounts.md); skip this step there.

For a **new** Supabase project, create the first super admin once, by hand:

1. Supabase → **Authentication → Users → Add user**: the email and a strong password, with *Auto confirm user* on.
2. Supabase → **SQL Editor**, with that email:

   ```sql
   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"super_admin"}'
    where email = 'owner@example.com';
   update public.profiles set role = 'super_admin'
    where id = (select id from auth.users where email = 'owner@example.com');
   ```

   (The role lives in both places and they must agree: the first is what the app and the database rules read.)
3. Sign in at `/login`. Everything else is made from the admin area: **Employee passwords** sets each branch's
   cashier and kiosk password (the first cashier password for a branch creates its register login,
   `cashier.<branch code>@3k.local`), **Riders** and **Admins** create those accounts, and **Branches** holds each
   branch's address, phone and hours.

For development you can also create the sample customers, riders and every branch's admin, cashier and kiosk:

```bash
npm run seed:test-users
```

## 5. Optional: photos

```bash
npm run seed:brand            # uploads the bundled logo to Storage
npm run seed:product-images   # placeholder dish photos (openly licensed, see seed-data/product-images.json)
```

Both only fill in what is still empty; pass `-- --force` to replace.

## 6. Run it

```bash
npm run dev                   # http://localhost:5173
```

Each screen's address is in [overview.md](./overview.md#the-people-and-the-screens).

## 7. Check everything works

```bash
npm run typecheck && npm run build
npm run check:flows           # every order, payment, rider, chat and gate flow, against your Supabase project
```

`check:flows` writes a few test orders as the `@3k.local` accounts; see [testing.md](./testing.md).

---

## Optional: Google sign-in

The "Continue with Google" button works once Google is enabled in Supabase.

1. **Google Cloud Console** → **Google Auth Platform**: set up the consent screen (audience *External*).
2. **Clients → Create client** → *Web application*. Under *Authorized redirect URIs* add
   `https://<your-project-ref>.supabase.co/auth/v1/callback`. Copy the **Client ID** and **Client secret**.
3. **Supabase → Authentication → Sign In / Providers → Google**: enable it and paste both values.
4. **Supabase → Authentication → URL Configuration → Redirect URLs**: add `http://localhost:5173/auth/callback`
   (and your real site's `/auth/callback` when you deploy).
5. While the Google app is in *Testing*, only listed test users can sign in. **Publish app** opens it to everyone.

Google accounts become ordinary customers. They never get staff roles.

## GCash

GCash is paid by hand into the restaurant's own GCash account; there is no payment provider. Set the account in
`.env.local`:

```
NEXT_PUBLIC_GCASH_NAME=Ruchell Quesada
NEXT_PUBLIC_GCASH_NUMBER=0907 131 2306
NEXT_PUBLIC_GCASH_QR_IMAGE=/brand/gcash-qr.svg
```

`NEXT_PUBLIC_GCASH_QR_IMAGE` is a full URL or a path on the site. `/brand/gcash-qr.svg` is a **placeholder**: put the
real QR exported from the GCash app in `public/brand/` and point this at it. Leave the number empty and GCash is hidden
everywhere (cash only). See [how-it-works.md](./how-it-works.md#gcash-manual).

---

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run dev` | The app with hot reload, on port 5173 |
| `npm run build` / `npm start` | Production build, then serve it |
| `npm run typecheck` | TypeScript over `src/` and `scripts/` |
| `npm run check:flows` | End-to-end checks of every flow (writes test orders) |
| `npm run seed:test-users` | Every test login in [test-accounts.md](./test-accounts.md) |
| `npm run seed:menu` | Regenerate `supabase/seed.sql` from `menu.json` |
| `npm run seed:brand` / `seed:product-images` | Logo and placeholder dish photos |

Something not working? See [operations.md](./operations.md#troubleshooting).
