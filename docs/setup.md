# Setup, hosting and running it

You need **Node.js 20+** and a **Supabase** project. There is no other server: the Next.js app talks to Supabase,
and its server actions run on the same host.

## 1. Supabase project

Note three values from **Project Settings → API**: the project URL, the **publishable** key (`sb_publishable_…`,
browser-safe) and the **secret** key (`sb_secret_…`, server only, never in git or a `NEXT_PUBLIC_` variable).

## 2. Database

Apply every file in `supabase/migrations/` **in filename order** (SQL editor or Supabase CLI), then run
`supabase/seed.sql` for the menu (safe to run twice; regenerate it from `supabase/seed-data/menu.json` with
`npm run seed:menu`).

| # | Migration | Adds |
| --- | --- | --- |
| 1–4 | `20260903…init_schema` → `20260912020000…revoke_function_execute` | Menu, orders, channels, roles, payments, kiosks, RLS, locked-down functions |
| 5–13 | `20260920…employee_credentials` → `20260927…chat_images` | Kiosk password, menu images, chat, saved address, guest numbers, validation rules, map-pin fix, sales report, chat photos |
| 14–20 | `20261010…super_admin_role` → `20261011…remove_promo_image` | Super admin, seven branches and branch scoping, sold out per branch, scheduled orders, logo-only site images |
| 21–22 | `20261012…manual_gcash`, `20261012000100_drop_paymongo` | Manual GCash (reference no., receipt, verifier, private bucket); removes the old payment provider's table and columns |
| 23–25 | `20261018000000…nextjs_client_writes` → `…000200_tighten_function_grants` | Browser write policies and the triggers that own prices, totals and payment status |
| 26 | `20261018000300_lock_chat_threads_and_items` | Chat thread fields locked; customers cannot add items to a placed order |
| 27 | `20261018000400_rate_limits_and_order_rules` | Rate-limit counters; the database checks an online order's branch, time and delivery details |
| 28 | `20261018000500_remove_refund_failed` | Drops the unused `refund_failed` payment status (refunds are by hand) |
| 29 | `20261018000600_remove_confirmed_status` | Order flow New → Preparing → Ready → Completed (no `confirmed`); kiosk and walk-in orders paid before the kitchen |
| 30 | `20261020000000_password_reset_lookup` | `password_reset_target`: Forgot password checks the email has an account (server only) |

Never edit an applied migration; add a new one.

## 3. Settings

`cp .env.example .env.local`, then fill in:

| Variable | Required | What |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Project URL. Also decides which photos the image optimizer may resize, so it must be set at **build** time |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Publishable key |
| `SUPABASE_SECRET_KEY` | yes | Secret key, read only by `src/utils/supabaseAdmin.ts` (`server-only`: the build refuses to bundle it for the browser) |
| `NEXT_PUBLIC_GCASH_NAME` / `_NUMBER` / `_QR_IMAGE` | no | The GCash account customers pay. No number = cash only |

`NEXT_PUBLIC_*` values are built into the bundle: change them, then rebuild.

## 4. First super admin (new projects only)

The demo project already has every login ([credentials.md](./credentials.md)). For a new one: Supabase →
Authentication → **Add user** (auto-confirm), then in the SQL editor:

```sql
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"super_admin"}' where email = 'owner@example.com';
update public.profiles set role = 'super_admin' where id = (select id from auth.users where email = 'owner@example.com');
```

Sign in at `/login`. Everything else is made from the admin area: **Employee passwords** (the first cashier password of
a branch creates its register login `cashier.<code>@3k.local`), **Riders**, **Admins**, **Branches**, dish photos in
**Menu**, the logo in **Site images**.

## 5. Run

| Command | What |
| --- | --- |
| `npm run dev` | Dev server on http://localhost:5173 |
| `npm run build` / `npm start` | Production build, then serve it |
| `npm run typecheck` | TypeScript |
| `npm run check:flows` | End-to-end checks against the database ([testing.md](./testing.md)); writes test orders |
| `npm run seed:menu` | Regenerate `supabase/seed.sql` from `menu.json` |

## Email: sign-up confirmation and password reset

Both emails carry a 6-digit code (`{{ .Token }}`) that the customer types into the app: the sign-up screen asks for it
after **Sign up** (and Log in asks for it if the email was never confirmed), and **Forgot password** asks for it with
the new password. No links, so nothing to add to the redirect URLs.

1. **Custom SMTP first:** Supabase only lets you edit the templates once one is set, and its built-in sender only
   delivers to your team's addresses. With Gmail:
   - Google account → Security → turn on **2-Step Verification**, then
     [App passwords](https://myaccount.google.com/apppasswords) → create one named `Supabase` and copy the 16 characters.
   - Supabase → Authentication → Emails → **SMTP Settings** → Enable custom SMTP: sender email = the Gmail address,
     sender name `3K Kitchen`, host `smtp.gmail.com`, port `465`, username = the Gmail address, password = the app
     password (no spaces).
   - Authentication → **Rate Limits**: emails per hour (30 by default with custom SMTP). Gmail allows about 500 a day.
2. Authentication → Sign In / Providers → **Email**: **Confirm email** on, **Email OTP Length** `6`, **Email OTP
   Expiration** `3600` (the emails say "an hour").
3. Authentication → **Emails** → Templates. Paste each file's whole content into **Message body**, then **Save changes**:

   | Template | Subject | File |
   | --- | --- | --- |
   | Confirm signup | `Your 3K Kitchen sign-up code` | `supabase/templates/confirm-signup.html` |
   | Reset password | `Your 3K Kitchen password reset code` | `supabase/templates/reset-password.html` |

The templates show the logo from its Storage URL; if you upload a new logo in **Site images**, update the `<img src>`
in both. Staff accounts (`@3k.local`) have no inbox: their passwords are reset by an admin.

## Optional: Google sign-in

1. Google Cloud → Google Auth Platform: consent screen (External), then a **Web** client with redirect URI
   `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Providers → **Google**: paste the client ID and secret.
3. Supabase → Authentication → URL Configuration: add `http://localhost:5173/auth/callback` and your site's
   `/auth/callback`.
4. **Publish** the Google app (in *Testing* only listed users can sign in). Google accounts are always customers.

## Optional: GCash

Manual: customers pay the restaurant's own account and staff verify each payment. Export the QR from the GCash app
(Receive → QR), put it in `public/brand/` (or any HTTPS URL), set the three `NEXT_PUBLIC_GCASH_*` variables, rebuild,
and scan it once to check it opens **your** account. The bundled `/brand/gcash-qr.svg` is a placeholder.

---

## Hosting

**Vercel** (recommended): import the repo, keep the *Next.js* preset, set the variables, deploy.

**Any Node host:** `npm ci && npm run build && npm start` (port `PORT`, default 3000) under a process manager, behind
a proxy that terminates HTTPS. The proxy **must overwrite `x-forwarded-for`** with the real visitor address: rate limits
count by it (Vercel does this already).

- **Security headers:** `next.config.ts` sets Referrer-Policy, Permissions-Policy and nosniff. Still to add: a
  **Content-Security-Policy** allowing Supabase (https + wss), `tile.openstreetmap.org`, `nominatim.openstreetmap.org`.
- **Menu photos** are resized by Next.js (`/_next/image`) and cached a year. On Vercel this uses the image allowance
  (about 70 photos, far inside the free tier); elsewhere it uses `sharp`, installed with Next.js.
- **Map tiles** are standard OpenStreetMap (no key, light traffic only). Keep the attribution; for heavy traffic switch
  provider in `src/view/components/mapPins.ts`.

**Supabase for production:** Site URL and redirect URLs set to your site only; **leaked-password protection** on;
backups on and a restore tried. Expected advisor findings: "RLS enabled, no policy" on the server-only tables
(`chat_thread_secrets`, `employee_credentials`, `kiosk_devices`, `order_counters`, `rate_limits`) and "signed-in users
can execute" on `chat_partner_name`, `order_items_total`, `is_active_user` (the policies need them).

## Go-live checklist

- [ ] Every development password changed, `@3k.local` accounts deleted, [credentials.md](./credentials.md) removed; repo private.
- [ ] `SUPABASE_SECRET_KEY` only as a server variable; HTTPS; a CSP added.
- [ ] All migrations applied; leaked-password protection on; redirect URLs list only your site; backups tested.
- [ ] Real GCash QR in place and tested: an online GCash order sent, approved, voided and marked refunded.
- [ ] Real branch addresses, phones and hours (seeded as 08:00–21:00 with no address); menu prices checked; logo set.
- [ ] Sample Privacy Policy and Terms (`src/view/presentation/legal/`) replaced with reviewed text.
- [ ] Test data cleaned up; `check:flows` run against a **separate** project, never production.

## Updating a live system

Back up → apply new migrations **before** the code that needs them → deploy → smoke test (log in, counter order, take
cash, check Sales) → add to [changelog.md](./changelog.md). To roll back code, redeploy the previous version; undo a
migration with a new one.

---

## Day to day

| To… | Do |
| --- | --- |
| Open a branch | Super admin → **Branches** → New branch; then its passwords, riders and an admin |
| Close a branch | Branches → Edit → untick **Open for orders** (history kept; never deleted) |
| Add or remove an admin's branches | Super admin → **Admins** → **Branches** (applies at once) |
| Add / deactivate a rider | Admin → **Riders** (deactivation applies on their next request) |
| Change a cashier or kiosk password | Admin → **Employee passwords** (open sessions and unlocked kiosks keep working) |
| Set up / retire a kiosk | Open `/kiosk` on it and unlock; Admin → **Kiosks** → Revoke. Tap the logo 5 times to lock it on the spot |
| Mark a dish sold out at one branch | Admin → Menu with the branch chosen → **Mark sold out** / **Back on** |
| Refund a voided GCash order | Send the money back from the GCash app, then Admin → Orders → **Mark refunded** |
| Forgot the super admin password | Supabase → Authentication → Users → send recovery or set one |
| Change someone's role | No screen, deliberately. Set both `app_metadata.role` and `profiles.role` (they must agree) |
| End of day | Admin → Sales → Today; compare **Cash** with the drawer; check the refunds-pending note |
| Rotate Supabase keys | New keys in the dashboard → update the host's variables → redeploy → disable the old ones |
| Orphaned chat photos | List files in `chat-images` whose folder has no `chat_threads` row; delete them from the Storage page (never with SQL on `storage.objects`) |

## Troubleshooting

| Symptom | Cause → fix |
| --- | --- |
| Nothing loads, or "invalid key" | `NEXT_PUBLIC_SUPABASE_URL` / publishable key wrong → fix and restart or rebuild |
| Cashier gate, kiosk, guest chat or admin Riders/Kiosks/Sales fail | `SUPABASE_SECRET_KEY` missing on the server |
| Right cashier/kiosk password refused | Wrong branch picked, or that branch has no password yet |
| "Too many attempts" | 10 wrong passwords from that address in 15 min → wait ([security.md](./security.md#rate-limits)) |
| "Closed now. Schedule your order for later" | Outside the branch's hours; expected. Check hours in Branches |
| Order missing from a cashier's queue | It belongs to another branch → Admin → Orders, All branches |
| GCash missing everywhere | `NEXT_PUBLIC_GCASH_NUMBER` empty → set it and rebuild |
| "Verify or reject the GCash payment before voiding" | Proof is waiting → approve or reject first |
| Can't edit an order | Cooking or payment started → void and re-enter |
| Dish can't be deleted / "Price not yet set" | Ordered dishes are kept → switch it off; set a price in Menu |
| Sales look empty | Only paid, non-voided orders count, by the Manila day placed → check the range |
| Google lands on a Supabase error | Provider off, or `/auth/callback` not in redirect URLs |
| Email has a link instead of a code | The template was pasted but not saved (**Save changes**), or Supabase's default is still in place |
| "That code is wrong or has expired" for a fresh code | Email OTP Length isn't 6, or an older email's code was used (each new email replaces the last code) |
| "Too many emails sent" | Supabase's email rate limit → set up custom SMTP, or wait |
| "Unsupported image" | Only JPEG, PNG, WebP (not HEIC or GIF) |
| `check:flows` fails at "sign in" | A demo password changed → reset it to [credentials.md](./credentials.md) |
| Server errors | Terminal running the app, or Vercel → Logs; database: Supabase → Logs / Advisors |
