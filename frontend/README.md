# Frontend

One React + Vite + Tailwind app for every screen of the 3K Kitchen ordering system. The API is in [`../backend`](../backend/README.md);
full documentation lives in [`../docs`](../docs/README.md).

| Address | Who | Access |
| --- | --- | --- |
| `/` | Everyone: landing page with the full menu, cart and chat with the cashier | None (login is asked for at checkout) |
| `/login`, `/register`, `/auth/callback` | Customer, rider, admin | Email and password, or Google |
| `/menu`, `/checkout`, `/orders`, `/profile` | Customer | `/menu` is public; the rest need a customer login |
| `/cashier` | Counter staff | Shared employee password |
| `/kiosk` | Self-order terminal | Shared employee password, once per browser |
| `/driver` | Rider | Rider login |
| `/admin` | Admin | Admin login (Sales, Orders, Menu, Riders, Kiosks, Site images, Employee passwords) |

## Run

```bash
cp .env.example .env     # API address, Supabase URL and publishable key (never the secret key)
npm install
npm run dev              # http://localhost:5173 (fixed: the API's CORS and the GCash return addresses expect it)
npm run build            # production build into dist/ (settings are read at build time)
```

The API must be running at `VITE_API_URL` (default `http://localhost:4000/api/v1`). Settings are listed in
[deployment](../docs/deployment.md#frontend-frontendenv-read-at-build-time).

## Source layout

```
src/
  pages/        customer/ cashier/ kiosk/ driver/ admin/ + Landing, Login, Register
  components/   ui.jsx (design system), chat/, AddressMap, PhoneInput, MenuBrowser, BottomDock…
  context/      Auth, Cart, Toast
  lib/          api, session, live updates, validation, formatting, geocoding
  index.css     design tokens (colours, radius, shadows)
```

How it fits together (live updates, sessions, storage keys, the design system): [architecture](../docs/architecture.md#frontend).
Field rules shared with the API: [data-dictionary](../docs/data-dictionary.md#input-rules-the-same-everywhere).
How each screen is used: [user-guide](../docs/user-guide.md).

## Things worth knowing

- **All writes go through the API.** The Supabase client here is for live updates and Google sign-in only.
- Staff screens are code-split, and the map library loads only when a delivery address is being entered.
- The delivery map uses OpenStreetMap (no key). Address lookups are debounced to respect its fair-use limit.
- Forms use the shared field rules (`src/lib/validation.js`): mobile numbers are 11 digits starting `09`.
- The session refreshes before it expires, is shared between tabs, and ends only when the server rejects it.
