# Changelog

What has been built, grouped by feature, with the database migration that goes with each. Newest first. Migration
numbers are the dates in the file names under `backend/supabase/migrations/`. Security-relevant changes are also
listed in [security.md](./security.md#issues-found-and-fixed).

## Landing page built around the branches; no promo photo; CARTO light maps
*Migration `20261011000000_remove_promo_image.sql`*
- The **promo photo is gone**: from the landing page, Admin → Site images (now the logo only), the API (`promo` is an
  unknown key, `400`), the database (row removed, key check narrowed) and the bundled defaults. The stored file was
  deleted through the API first.
- **Landing page revamp:** the hero is the branch map, beside a "Your branch" card (nearest to you, open now, hours,
  distance, *Order from …*) and quick facts; then every branch as a card (*Find us in Cavite*), a four-step *How it
  works* that starts with picking a branch, the menu, and a footer listing all branches with their hours.
- Every map uses **CARTO's light tiles** (OpenStreetMap data) when `VITE_CARTO_BASEMAPS_KEY` (a free CARTO key) is set,
  and standard OpenStreetMap tiles otherwise; chosen once in `frontend/src/components/mapPins.js`.

## Multiple branches, branch admins, branch map and scheduled orders
*Migrations `20261010000000_super_admin_role.sql`, `20261010010000_branches.sql`,
`20261010010100_has_branch_access_anon.sql`, `20261010010200_has_branch_access_invoker.sql`,
`20261010020000_branch_availability.sql`, `20261010030000_scheduled_orders.sql`*
- **Seven branches** (GMA Terminal, Dasma Bayan, Langkaan, Gen-Tri, Trece, Silang, Imus). Every order, kiosk, website chat,
  order number and kiosk password belongs to a branch; existing data moved to GMA Terminal. See
  [how-it-works.md](./how-it-works.md#branches).
- **Roles revised:** `admin` now runs only the branches assigned to them (one or several) and cannot see any other;
  the new **`super_admin`** sees every branch and manages branches, admin accounts, the shared menu and prices, site images
  and roles. Existing admins became super admins. Enforced in the API and by row-level security, so live feeds are scoped
  too ([security.md](./security.md#branch-isolation)).
- **Super admin can add and edit branches** (Admin → Branches): name, code, address, phone, map pin, opening hours or
  24 hours, open for orders. Branches are deactivated, never deleted. **Admins** page to create branch admins and set
  their branches.
- **Branch map on the landing page:** all branches on OpenStreetMap, framed on the middle of them, with hours, open/closed
  now, distance and **Order here**; a list beside it, nearest first when location is allowed.
- **Preferred branch when ordering:** defaults to the nearest branch (location asked once), otherwise the first; the
  customer's own pick is remembered and wins. Pickers on the menu page and at checkout.
- **Sold out per branch:** the menu stays shared; a branch admin marks a dish sold out at their branch only.
- **Scheduled online orders:** as soon as possible (only while the branch is open) or a 15-minute slot up to two days
  ahead inside the branch's hours. The cashier's queue sorts by when orders are due and highlights scheduled ones
  (amber, orange with a countdown in the last hour) with a "start preparing" banner.
- Per-branch cashier logins and kiosk passwords (gates ask for the branch); riders see only their branch's pool; the
  admin screens and the register get a branch switcher; the sales report adds sales **by branch**.
- Fix: the address map's search box was a form nested inside the checkout form (invalid HTML; Enter could submit the order).
- 525 tests (50 new), including branch isolation, sold out, branches and scheduling; `check-rls.mjs` checks branch scoping.

## Photos in chat
*Migration `20260927000000_chat_images.sql`*
- Guests, cashiers, customers and riders can send photos in chat: a picture button beside the message box.
- Private storage bucket, links that expire after an hour, 5 MB, JPEG/PNG/WebP, the file's real bytes checked, 30 per
  conversation, 10 per 10 minutes for guests; guests can attach after their first message.
- Photos are shrunk in the browser first; links stay stable so pictures do not flicker on refresh.

## Admin sales dashboard
*Migration `20260926000000_sales_report.sql`*
- New **Sales** page (admin's home): Today / 7 days / 30 days / This month / Custom (Manila days); cards for sales, orders,
  average order and items sold; sales per day, cash vs GCash, by channel, top 10 dishes; refunds-pending note; a table view.
- A sale = paid and not voided or cancelled, counted when paid ([how-it-works.md](./how-it-works.md#sales-report)).
- Computed by a database function; `GET /admin/sales`. Tested with exact figures on a backdated day.
- Cash payments now record who took the money, the amount handed over and the change.

## Validation, map pins, data dictionary and a bug sweep
*Migrations `20260925000000_validation_and_hardening.sql`, `20260925010000_fix_pin_constraints.sql`*
- **Phone numbers** must be 11 digits starting `09` (form, API and database); a numeric `PhoneInput`.
- Shared field rules (trimmed text, money with two decimals and a ceiling, quantity 1 to 99, image links, etc.), mirrored in
  the forms and enforced by database constraints.
- **Delivery map:** pin your address on an OpenStreetMap map (tap, drag, use your location, or search); street, barangay and
  city fill in; saved with the order and the profile; riders, cashiers, admins and customers get an **Open in Maps** link.
- **[data-dictionary.md](./data-dictionary.md)** written from the live schema.
- **Fixes:** customers could write orders directly (free orders); order numbers collided on the second day; voiding after a
  failed refund kept money; refund retry never worked; payment notification failures were swallowed; double payments;
  editing or deleting ordered products; deactivated riders kept working; shared sign-in client leaked sessions; order search
  broke on punctuation; logout ended every device's session; cashier and kiosk rate limits no longer count successful logins;
  the Google sign-in revoked its own session (users bounced to login at checkout); sessions refresh before expiring and are
  shared between tabs; sign-out clears the cart; live subscriptions no longer rebuild on every keystroke; the cashier's
  Cancelled/Active tabs no longer miss old orders; payment result pages stop polling when left; failed kiosk payments reset;
  Back from GCash no longer freezes checkout; dialogs trap keyboard focus; buttons that were links inside buttons fixed.
- Toasts moved to the top and a bottom dock keeps the cart bar and chat button apart.

## Guest numbers in chat
*Migration `20260924000000_chat_guest_number.sql`*
- Anonymous visitors appear to the cashier as `Guest-1023` (or `Maria (Guest-1023)`), so several guests can be told apart.

## Profile page, redesign and the test-accounts guide
*Migration `20260923000000_profile_address.sql`*
- **Profile** (`/profile`): name, mobile number, default delivery address and password change (not for Google accounts);
  checkout prefills from it. Header account menu with avatar.
- **Redesign:** modern and minimal while keeping the brand: new tokens, flatter surfaces, hairline borders, script font only
  for the wordmark and hero; applied to every screen including cashier, driver, admin and kiosk.
- [test-accounts.md](./test-accounts.md): every role's login (cashier and kiosk are password-only) and walkthroughs.
- **Security:** users could edit their own role and active status in the profiles table; that policy was removed.

## Google sign-in
- "Continue with Google" on login and sign-up; checkout returns you to your cart. Google users are ordinary customers.
- **Security:** a role could be self-assigned by editing `user_metadata`; roles are now read only from `app_metadata`.

## Chat
*Migration `20260922000000_chat.sql`*
- **Landing page chat:** anyone, no account, can message the cashier; the cashier has a **Messages** inbox with unread badge.
- **Delivery chat:** a customer and the rider holding their order, only while it is out for delivery.
- The full **menu on the landing page**; login is asked for only at checkout, and the cart survives it.
- Live updates for logged-in users; a content-free broadcast ping plus a secret token for guests.

## Photos for dishes, logo and promo
*Migration `20260921000000_menu_images_storage.sql`*
- Per-product photos uploaded from Admin → Menu; logo and home-page photo editable from **Site images**.
- Stored in the public `menu-images` bucket, byte-checked, old files removed when replaced.
- Placeholder photos for the whole menu from openly licensed sources (credits in `product-images.json`).

## Employee passwords
*Migration `20260920000000_employee_credentials.sql`*
- `/cashier` and `/kiosk` ask only for a shared **password** (no email). Admins change both from Admin → Employee passwords.
- A correct kiosk password registers that browser as a kiosk device (revocable); wrong-guess rate limits.

## Foundation
*Migrations `20260903000000_init_schema.sql`, `20260912000000_multichannel_orders.sql`,
`20260912010000_harden_functions.sql`, `20260912020000_revoke_function_execute_from_public.sql`*
- The menu (categories, products, size options) and its seed.
- Three ordering channels (kiosk, counter, online), order numbers, the full order lifecycle, cash and GCash payments,
  voids and refunds, the rider pool and cash on delivery, the kiosk with device keys, admin management of riders,
  kiosks and roles.
- Row-level security scoping what each role sees (and therefore what its live feed carries).
- The automated test suite (unit, integration, end-to-end) against the real database.
