# Changelog

Newest first. Migration numbers are the dates in `supabase/migrations/`.

## 2026-10-18: Next.js + Supabase, hardening and speed

- **One Next.js app** (MVC like Pasuyo) replaces the Vite frontend and the Express API; the browser talks to Supabase
  directly and server actions use the secret key. Same screens and flows. *(migrations 23–25)*
- **The database guards the money and the rules:** per-role write policies; triggers for prices, totals, payment status,
  status moves, chat thread fields, adding items after ordering, and online ordering rules (branch open and active, valid
  slot, delivery details). *(23–27)*
- **Rate limits restored**, counted in the database: gates, password change, kiosk orders, guest chat. *(27)*
- **Faster:** menu photos resized to their drawn size (11.5 MB → 2.8 MB for the whole menu on a phone); self-hosted
  fonts; stale-while-revalidate caching for public data only; fewer requests on the cashier screen; skeleton loading.
- **Simpler cashier screen:** the order flow is New → Preparing → Ready → Completed (the "Confirmed" step and the
  "Send to kitchen" button are gone); at most three controls per order (Take payment, the next step, More); kiosk and
  walk-in orders are paid before the kitchen; the header no longer repeats a single branch's name. *(29)*
- **Old payment provider fully removed:** its table and columns, and the unused `refund_failed` status. *(22, 28)*
- **Polish:** per-page titles, an error page with *Try again*, staff headers that fit on phones, even menu cards, no
  invalid HTML nesting.
- **Privacy Policy and Terms** pages (sample text, no email contacts; requests go through the branch chat or counter).
- **Fixed:** a rider's claim reset the order total to 0.
- **Removed:** the Express test suite (replaced by `check:flows`), CARTO maps, seed scripts and their passwords.

## 2026-10-12: Manual GCash *(21–22)*

No payment provider: customers pay the restaurant's own GCash and send a reference number or receipt (private bucket); staff approve or
reject it. Kiosk shows the QR; the counter records the receipt's reference. Voided GCash orders are refunded by hand
(**Refund pending → Refunded**).

## 2026-10-10/11: Branches *(14–20)*

Seven branches; every order, kiosk, chat, number and password belongs to one. `admin` scoped to assigned branches,
`super_admin` for everything; Branches and Admins pages. Landing page built around a branch map (nearest branch, open
now, directions); sold out per branch; scheduled online orders with highlighted queue; sales by branch; logo-only site
images; sonner toasts.

## 2026-09: Foundation *(1–13)*

Menu, three channels (kiosk, counter, online), order numbers, lifecycle, cash and GCash, voids, rider pool and cash on
delivery, kiosk device keys, RLS. Employee passwords for cashier and kiosk; menu photos and logo; guest and delivery chat
(with photos and guest numbers); Google sign-in; profile with saved address; delivery map pins; 11-digit phone rule and
shared field limits; sales dashboard; redesign. Security fixes: self-assigned admin, free/self-paid orders, editable
roles, double payments, colliding order numbers.
