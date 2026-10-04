# 3K Kitchen – GMA Terminal Branch (frontend)

One React + Vite + Tailwind SPA for every interface. The backend lives in `../backend`.

| Route | Who | Access |
| --- | --- | --- |
| `/` | Public landing page: full menu, cart, and a chat widget to message the cashier | none (login is asked for at checkout) |
| `/login`, `/register` | Customer, driver, admin | email + password; redirects by role |
| `/menu`, `/checkout`, `/orders` | Customer | `/menu` is public, the rest need a customer login |
| `/driver` | Rider | rider login |
| `/admin` | Admin | admin login (orders, menu with product photos, riders, kiosks, site images, employee passwords) |
| `/cashier` | Counter staff | employee password |
| `/kiosk` | Self-order terminal | employee password (once per browser) |

## Run

```bash
cp .env.example .env   # API URL + Supabase URL and publishable key
npm install
npm run dev            # http://localhost:5173 (the port the backend CORS/GCash URLs expect)
```

The backend must be running on `VITE_API_URL` (default `http://localhost:4000/api/v1`).

## Google sign-in

"Continue with Google" is on `/login` and `/register`. The code is done; it needs a one-time setup that lives outside the repo:

1. Google Cloud Console → APIs & Services → Credentials → create an **OAuth client ID** (type: Web application). Add the authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Supabase dashboard → Authentication → Sign In / Providers → **Google** → enable it and paste the client ID and secret.
3. Supabase → Authentication → URL Configuration → add `http://localhost:5173/auth/callback` (and your production domain's `/auth/callback`) to **Redirect URLs**.

Google accounts are plain customers. Staff roles (admin, cashier, rider) are only ever set server-side, never by signing in.

## Notes

- Images are uploaded through the API into the Supabase `menu-images` bucket (shrunk in the browser first). The logo and promo fall back to `public/brand/` until replaced under Admin → Site images.
- Delivery addresses can be pinned on a map (OpenStreetMap through Leaflet, no API key). Tapping the map or using the customer's location looks up the street, barangay and city and fills the form; the pin is saved with the order and riders get an "Open in Maps" directions link. Lookups go to Nominatim, which allows about one request per second, so they are debounced. The map opens on `VITE_MAP_DEFAULT_LAT/LNG` (General Mariano Alvarez by default).
- Forms follow the shared field rules in [`docs/DATA-DICTIONARY.md`](../docs/DATA-DICTIONARY.md) (`src/lib/validation.js`, `PhoneInput`): mobile numbers are 11 digits starting `09`.
- The session refreshes itself before it expires and is shared between tabs; it is only ended when the server rejects the refresh token.
- Chat: visitors message the cashier from `/` with no account (a thread token in localStorage, live via Broadcast pings); the cashier reads them under **Messages** in `/cashier`; online customers and the rider holding their order chat from the order page and `/driver`. Everyone can send photos (shrunk in the browser first); they are stored privately and shown through links that expire.
- Writes always go through the REST API. Supabase is used for Realtime only (cashier queue, driver pool, customer order status).
- The kiosk polls its order every 2s while waiting for GCash, since it has no signed-in user.
- Staff pages are code-split, so customers never download the POS or admin bundle.
