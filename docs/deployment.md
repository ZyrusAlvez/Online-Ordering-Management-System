# Deployment

Every setting, how the app is hosted, how to connect the third-party services, and the checklist to go live.
Local setup is in [getting-started.md](./getting-started.md); the security reasoning is in [security.md](./security.md).

**Contents:** [Shape of a deployment](#shape-of-a-deployment) · [Environment variables](#environment-variables) ·
[Supabase](#supabase) · [Google sign-in](#google-sign-in) · [GCash](#gcash) ·
[Building and hosting](#building-and-hosting) · [Go-live checklist](#go-live-checklist) ·
[Updating a live system](#updating-a-live-system)

---

## Shape of a deployment

Two parts:

| Part | What | Needs |
| --- | --- | --- |
| **Database, accounts, files, live updates** | Your Supabase project | Nothing to host; apply the migrations |
| **The app** | This Next.js app | A Next.js host (Vercel, or any Node ≥ 20 server running `npm start`), the settings below |

There is no separate API server. The browser talks to Supabase directly; the server actions (cashier and kiosk gates,
kiosk orders, guest chat, staff accounts, sales report, password change) run inside the Next.js app on the host.

## Environment variables

Set these on the host (Vercel: Project → Settings → Environment Variables), or in `.env.local` for local runs.
`NEXT_PUBLIC_*` values are built into the browser bundle, so change them, then **rebuild**.

| Variable | Required | What |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | The project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | The publishable key (public by design) |
| `SUPABASE_SECRET_KEY` | yes | The secret key. **Server only**: read by `src/utils/supabaseAdmin.ts`, which the build refuses to bundle for the browser. Never prefix it with `NEXT_PUBLIC_` |
| `CASHIER_EMAIL` | no | Default `cashier@3k.local`. Its domain names each branch's register login (`cashier.<code>@…`) |
| `NEXT_PUBLIC_GCASH_NAME`, `NEXT_PUBLIC_GCASH_NUMBER`, `NEXT_PUBLIC_GCASH_QR_IMAGE` | no | The GCash account customers pay into. No number = GCash hidden, cash only |
| `NEXT_PUBLIC_CARTO_BASEMAPS_KEY` | no | CARTO key for the light map style; without it, OpenStreetMap tiles |
| `NEXT_PUBLIC_MAP_DEFAULT_LAT`, `NEXT_PUBLIC_MAP_DEFAULT_LNG` | no | Where the address map opens (default General Mariano Alvarez) |
| `TEST_ADMIN_PASSWORD`, `TEST_CASHIER_PASSWORD`, `TEST_KIOSK_PASSWORD`, `SEED_*` | dev only | Written and read by the seed scripts; never set them in production |

## Supabase

1. **Create the project** and note the URL and keys ([getting-started.md](./getting-started.md#1-create-the-supabase-project)).
2. **Apply every migration in order**, then load `seed.sql` (menu). Verify with the advisors (below).
3. **Authentication → URL Configuration:** set the Site URL to your site, add `https://<your site>/auth/callback` to
   the redirect URLs, and remove `localhost` entries you no longer need.
4. **Authentication → Passwords:** turn on **leaked password protection**.
5. **Authentication → Providers:** enable Google if you use it ([below](#google-sign-in)); decide whether email
   confirmation is required for sign-ups.
6. **Storage:** the buckets and their policies come from the migrations. Nothing to add.
7. **Backups:** enable them and **practise a restore** before real orders flow.
8. **Advisors:** run the security and performance advisors after migrating. Expected findings: "RLS enabled, no
   policy" on the server-only tables (`chat_thread_secrets`, `employee_credentials`, `kiosk_devices`,
   `order_counters`, `webhook_events`), and "signed-in users can execute" on `chat_partner_name`,
   `order_items_total` and `is_active_user`, which the policies need. Anything else deserves a look.

## Google sign-in

Steps are in [getting-started.md](./getting-started.md#optional-google-sign-in). For production also: add the production
`/auth/callback` to Supabase's redirect URLs, and **publish** the Google app (it starts in *Testing*).

## GCash

GCash is manual: customers pay the restaurant's own GCash account and staff verify each payment, so there is no
provider account, key or webhook to set up. To enable it:

1. In the GCash app, open the account's **QR** (Receive → QR) and save the image.
2. Put it in `public/brand/` (it ships with the site) or host it anywhere over HTTPS.
3. Set the three `NEXT_PUBLIC_GCASH_*` variables and rebuild.
4. Scan the QR from the order page with a phone to check it opens **your** account before customers use it.

The bundled `/brand/gcash-qr.svg` is a **placeholder** that does not pay anyone; replace it before going live.

---

## Building and hosting

**Vercel** (recommended): import the repository, keep the framework preset *Next.js*, set the environment variables,
deploy. Every page and server action is served from the one project.

**Any Node host:**

```bash
npm ci
npm run build
npm start                     # serves on PORT (default 3000)
```

Run it under a process manager behind a reverse proxy that terminates HTTPS. Set security headers there (or in
`next.config.ts`), in particular a **Content-Security-Policy** allowing Supabase (including websockets), CARTO map
tiles (`basemaps.cartocdn.com`, or `tile.openstreetmap.org` without a CARTO key), Nominatim
(`nominatim.openstreetmap.org`), Google Fonts, and images from Supabase Storage.

**Map tiles.** Every map uses CARTO's *light* basemap when `NEXT_PUBLIC_CARTO_BASEMAPS_KEY` is set (free from
<https://carto.com/basemaps/apikey>; 1 million tile requests a month for commercial use). Keep the "© OpenStreetMap
contributors, © CARTO" attribution. Without the key the maps use OpenStreetMap's own tiles, whose fair-use policy suits
light traffic only. The choice lives in `src/view/components/mapPins.ts`.

---

## Go-live checklist

**Accounts and secrets**
- [ ] All development passwords changed: admin, cashier, kiosk, sample riders. The `@3k.local` sample accounts deleted.
- [ ] [test-accounts.md](./test-accounts.md) removed or kept out of public view; the GitHub repository is **private**.
- [ ] `SUPABASE_SECRET_KEY` is set only as a server environment variable, never `NEXT_PUBLIC_`.
- [ ] Real riders created from Admin → Riders with strong temporary passwords.

**Configuration**
- [ ] `NEXT_PUBLIC_*` values set for production and the site rebuilt.
- [ ] HTTPS everywhere; security headers and a CSP set.

**Supabase**
- [ ] Every migration applied, in order; menu seeded; advisors reviewed.
- [ ] Redirect URLs list your real site only; leaked-password protection on.
- [ ] Backups on and a restore tried.

**Payments** (if using GCash)
- [ ] The real GCash QR replaces the placeholder, and scanning it opens the restaurant's account.
- [ ] A test online GCash order was sent, approved and (after a void) marked refunded by staff.

**Content**
- [ ] Menu prices checked (a dish with no price cannot be ordered); photos uploaded or placeholders accepted; logo set.
- [ ] Kiosk devices unlocked and listed in Admin → Kiosks; a test order taken through every channel.

**Verification**
- [ ] `npm run check:flows` passes against a **separate** project, never production.
- [ ] Walk through [test-accounts.md](./test-accounts.md) once with real (changed) credentials.

---

## Updating a live system

1. Back up first (or confirm the latest automatic backup).
2. **Database:** apply any new migrations, in order, *before* the code that needs them.
3. **App:** deploy the new version (Vercel builds each push; elsewhere `npm ci && npm run build && npm start`).
4. Smoke test: log in, place a counter order, take cash, check Sales.
5. Update [changelog.md](./changelog.md).

To roll back code, redeploy the previous version. Migrations are not automatically reversible: write a new migration
that undoes a change rather than editing an applied one.
