# Deployment

Every setting, how the pieces are hosted, how to connect the third-party services, and the checklist to go live.
Local setup is in [getting-started.md](./getting-started.md); the security reasoning is in [security.md](./security.md).

**Contents:** [Shape of a deployment](#shape-of-a-deployment) · [Environment variables](#environment-variables) ·
[Supabase](#supabase) · [Google sign-in](#google-sign-in) · [GCash (PayMongo)](#gcash-paymongo) ·
[Building and hosting](#building-and-hosting) · [Go-live checklist](#go-live-checklist) ·
[Updating a live system](#updating-a-live-system)

---

## Shape of a deployment

Three parts, each hosted separately:

| Part | What | Needs |
| --- | --- | --- |
| **Database and accounts** | Your Supabase project | Nothing to host; apply the migrations |
| **API** | `backend/`, a long-running Node process | Node ≥ 20, HTTPS (usually behind a reverse proxy), the settings below |
| **Website** | `frontend/dist`, static files | Any static host, **with every path falling back to `index.html`** (the app uses browser routing, so `/cashier` or `/orders/123` must serve the app, not a 404) |

The website talks to the API (`VITE_API_URL`) and to Supabase directly for live updates only.

## Environment variables

### Backend (`backend/.env`)

The server validates these at start-up and refuses to run with a clear message if a required one is wrong.

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | **Set `production` when live.** Development shows stack traces in error responses |
| `PORT` | no | `4000` | Port the API listens on |
| `API_PREFIX` | no | `/api/v1` | Path prefix for every route |
| `CORS_ORIGIN` | no | `*` | Comma-separated website addresses allowed to call the API. **Set to your site in production** (the server warns if left as `*`) |
| `LOG_FORMAT` | no | `dev` | Request log style (`combined` suits production) |
| `RATE_LIMIT_WINDOW_MS` | no | `900000` | Length of the global rate-limit window |
| `RATE_LIMIT_MAX` | no | `300` | Requests per IP per window |
| `TRUST_PROXY` | no | `1` | How many reverse proxies are in front of the API (`0` if none). Wrong values break rate limiting or let clients fake their address. See below |
| `SUPABASE_URL` | **yes** | | Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | **yes** | | Publishable key (`sb_publishable_…`) |
| `SUPABASE_SECRET_KEY` | **yes** | | Secret key (`sb_secret_…`). Server only |
| `SUPABASE_JWKS_URL` | no | | Reserved; currently unused |
| `DATABASE_URL` | no | | Reserved for direct SQL tooling; currently unused |
| `PAYMONGO_SECRET_KEY` | for GCash | | `sk_test_…` while testing, `sk_live_…` live |
| `PAYMONGO_WEBHOOK_SECRET` | for GCash | | Signing secret (`whsk_…`) of the webhook you register |
| `PAYMONGO_API_URL` | no | `https://api.paymongo.com/v1` | Leave as is |
| `PUBLIC_APP_URL` | no | `http://localhost:5173` | Your website's address. GCash sends online customers back to `PUBLIC_APP_URL/payment-result` |
| `KIOSK_RETURN_URL` | no | `http://localhost:5173/kiosk/payment-result` | Where GCash sends kiosk customers back |
| `CASHIER_EMAIL` | no | `cashier@3k.local` | The shared cashier account the cashier password signs in to |
| `TEST_ADMIN_PASSWORD`, `TEST_CASHIER_PASSWORD`, `TEST_KIOSK_PASSWORD` | tests only | | Written by `seed-accounts`; used by `npm test`. Not needed in production |

**`TRUST_PROXY`:** the API uses the client's IP for rate limiting. With one proxy or load balancer in front (the usual
case) leave `1`. With none, set `0`, otherwise a client can fake its address with a header. With two layers (a CDN and a
proxy), set `2`; otherwise every visitor looks like one address and shares one rate-limit budget.

### Frontend (`frontend/.env`, read at **build** time)

| Variable | Required | Meaning |
| --- | --- | --- |
| `VITE_API_URL` | **yes** | The API's full address including the prefix, e.g. `https://api.example.com/api/v1` |
| `VITE_SUPABASE_URL` | **yes** | Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | **yes** | Publishable key only; **never** the secret key |
| `VITE_MAP_DEFAULT_LAT`, `VITE_MAP_DEFAULT_LNG` | no | Where the delivery map opens (default General Mariano Alvarez, Cavite) |

Because Vite bakes these in when you build, change them and **rebuild** to take effect.

---

## Supabase

1. **Create the project** and note the URL and keys ([getting-started.md](./getting-started.md#1-create-the-supabase-project)).
2. **Apply every migration in order**, then load `seed.sql` (menu). Verify with the advisors (below).
3. **Authentication → URL Configuration:** add your site's address (and `/auth/callback`) to the allowed redirect URLs,
   and remove `localhost` entries you no longer need.
4. **Authentication → Passwords:** turn on **leaked password protection**.
5. **Authentication → Providers:** enable Google if you use it ([below](#google-sign-in)); decide whether email
   confirmation is required for sign-ups.
6. **Storage:** the buckets are created by migrations (`menu-images` public, `chat-images` private). No extra policies
   are needed or wanted.
7. **Backups:** enable them in the Supabase dashboard (the free tier's options are limited; consider a paid plan before
   real orders flow) and **practise a restore**.
8. **Advisors:** run the security and performance advisors after migrating. Expected, harmless findings: "RLS enabled,
   no policy" on the five server-only tables, and a few performance hints listed in
   [data-dictionary.md](./data-dictionary.md#known-gaps). Anything else deserves a look.

## Google sign-in

Steps are in [getting-started.md](./getting-started.md#optional-google-sign-in). For production also: add the production
`/auth/callback` to Supabase's redirect URLs, add your production domain's Supabase callback to the Google client's
redirect URIs if it differs, and **publish** the Google app (it starts in *Testing*, limited to listed test users).

## GCash (PayMongo)

Without this, cash works fully and GCash answers "not configured". To enable it:

1. Create a PayMongo account and use **test mode** first (`sk_test_…`).
2. Put the secret key in `PAYMONGO_SECRET_KEY`.
3. In PayMongo → Developers → **Webhooks**, register `https://<your-api>/api/v1/webhooks/paymongo` for the events
   **`payment.paid`**, **`payment.failed`** and **`refund.updated`**. Copy the signing secret into
   `PAYMONGO_WEBHOOK_SECRET`.
4. Set `PUBLIC_APP_URL` and `KIOSK_RETURN_URL` to your real addresses.
5. **Test the whole loop in test mode:** a kiosk GCash order, an online GCash order, a payment that fails, a refund by
   voiding a paid order, and an abandoned payment retried. The code is tested against a fake PayMongo but has **never been
   run against the real service**, so this step is not optional.
6. Only then switch to `sk_live_…` and the live webhook secret.

The webhook endpoint must be reachable from the internet over HTTPS; locally, use a tunnelling tool. GCash needs an
order of at least ₱20.00 (a PayMongo rule).

---

## Building and hosting

**API**

```bash
cd backend
npm ci --omit=dev
NODE_ENV=production npm start        # reads the environment (or a .env file); no file watching
```

Run it under a process manager (systemd, pm2, a container) so it restarts on failure, behind a reverse proxy that
terminates HTTPS and forwards to `PORT`. It shuts down cleanly on `SIGTERM`. Health checks:
`GET /api/v1/health` (is it up) and `GET /api/v1/health/supabase` (can it reach the database).

**Website**

```bash
cd frontend
npm ci
npm run build                        # produces frontend/dist
```

Upload `frontend/dist` to a static host and configure the SPA fallback. Cache `assets/*` for a long time (file names
contain a content hash) and `index.html` not at all. Also set security headers there, in particular a
**Content-Security-Policy** (the app sets none itself); it needs to allow the API, Supabase (including websockets),
OpenStreetMap tiles (`tile.openstreetmap.org`) and Nominatim (`nominatim.openstreetmap.org`), Google Fonts, and images
from Supabase Storage.

**One address or two:** serving the website and API from different origins needs `CORS_ORIGIN` set to the website's
origin. Serving both from one domain (the proxy sending `/api` to Node) avoids CORS entirely.

---

## Go-live checklist

**Accounts and secrets**
- [ ] All development passwords changed: admin, cashier, kiosk, sample riders. The `@3k.local` sample customers deleted.
- [ ] [test-accounts.md](./test-accounts.md) removed or kept out of public view; the GitHub repository is **private**.
- [ ] `SUPABASE_SECRET_KEY` and the PayMongo keys exist only on the server.
- [ ] Real riders created from Admin → Riders with strong temporary passwords.

**Configuration**
- [ ] `NODE_ENV=production`; `CORS_ORIGIN` is your site; `TRUST_PROXY` matches your hosting.
- [ ] `PUBLIC_APP_URL` and `KIOSK_RETURN_URL` are your real addresses; `VITE_*` values rebuilt for production.
- [ ] HTTPS everywhere; the static host falls back to `index.html`; security headers and a CSP are set.

**Supabase**
- [ ] Every migration applied, in order; menu seeded; advisors reviewed.
- [ ] Redirect URLs list your real site only; leaked-password protection on.
- [ ] Backups on and a restore tried.

**Payments** (if using GCash)
- [ ] Full test-mode run succeeded (kiosk, online, failure, refund, retry); webhook delivering; then live keys.

**Content**
- [ ] Menu prices checked (a dish with no price cannot be ordered); real photos uploaded or placeholders accepted
      (their credits are in `seed-data/product-images.json`); logo and promo set.
- [ ] Kiosk devices unlocked and listed in Admin → Kiosks; a test order taken through every channel.

**Verification**
- [ ] `npm test` and `check-rls.mjs` pass against a **separate** project, never production.
- [ ] Walk through [test-accounts.md](./test-accounts.md) once with real (changed) credentials.

---

## Updating a live system

1. Back up first (or confirm the latest automatic backup).
2. **Database:** apply any new migrations, in order, *before* the code that needs them. Migrations are written to be
   safe on a live database (additive changes, constraints checked against existing data first); read the comment at the
   top of each.
3. **API:** deploy the new code and restart; confirm `/health` and `/health/supabase`.
4. **Website:** build and upload `dist`. People with the app open get the new version on their next page load.
5. Smoke test: log in, place a counter order, take cash, check Sales.
6. Update [changelog.md](./changelog.md).

To roll back code, redeploy the previous version. Migrations are not automatically reversible: write a new migration
that undoes a change rather than editing an applied one.
