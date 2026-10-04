# Changelog

What has been built, grouped by feature, with the database migration that goes with each. Newest first. Migration
numbers are the dates in the file names under `backend/supabase/migrations/`. Security-relevant changes are also
listed in [security.md](./security.md#issues-found-and-fixed).

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
