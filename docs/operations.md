# Operations

Running the system day to day, keeping it healthy, and fixing it when something is wrong.

**Contents:** [Routine tasks](#routine-tasks) · [Staff and devices](#staff-and-devices) · [Maintenance](#maintenance) ·
[Troubleshooting](#troubleshooting) · [Where to look](#where-to-look)

---

## Routine tasks

### Opening
1. Check the API is up: `GET /api/v1/health` answers `ok` (and `/health/supabase` can reach the database).
2. Open `/cashier`, enter the shared password, **Open register**. Check **Messages** for anything overnight.
3. Kiosks: make sure each one is on its start screen. A locked kiosk needs the employee password again.

### During service
- New orders and chats appear on their own. If a screen looks stale, the **Refresh** button is on the admin pages; the
  cashier and rider screens update live.
- Sold out a dish? Admin → Menu → the dish's **Available / Sold out** badge toggles it instantly.
- A customer wants to cancel a paid order: **Void** it in the cashier screen with a reason. GCash is refunded
  automatically; hand cash back yourself.
- A GCash order shows **refund failed**: **Void** again, or Admin → Orders → retry the refund.

### Closing
1. Open Admin → **Sales** → **Today**. Compare **Cash** with the drawer: cash sales on the Sales page should match
   what was taken (cash on delivery counts on the day the order was placed).
2. Check the **refunds pending** note; anything waiting should clear within a day. Otherwise see *refund failed* above.
3. Look in the cashier's **Active** tab for orders left open that should be completed or voided.

### Weekly
- Admin → Sales → **7 days** for the trend and the best sellers; consider hiding dishes that never sell.
- Admin → Kiosks: revoke devices no longer in use.
- Check the Supabase dashboard for backups succeeding and for storage use (photos accumulate).

---

## Staff and devices

| To… | Do this |
| --- | --- |
| **Add a rider** | Admin → Riders → **New rider** (name, email, temporary password, 11-digit phone). Tell them to log in at `/login` |
| **Remove a rider's access** | Admin → Riders → **Deactivate**. Takes effect on their very next request. Reactivate the same way |
| **Change the cashier or kiosk password** | Admin → **Employee passwords**. Cashier logins already open keep working until they sign out; kiosks already unlocked keep working until revoked |
| **Retire or lock out a kiosk** | Admin → Kiosks → **Revoke**. The terminal locks and asks for the password again |
| **Set up a new kiosk** | Open `/kiosk` on the device, enter the kiosk password. It registers itself and appears in Admin → Kiosks |
| **Lock a kiosk from the device** | Tap the logo on the start screen five times quickly and confirm |
| **Forgot the admin, cashier or kiosk password** | On the server: `SEED_ADMIN_PASSWORD=… SEED_CASHIER_PASSWORD=… SEED_KIOSK_PASSWORD=… node --env-file=.env scripts/seed-accounts.mjs` |
| **Make someone an admin or rider** | Only an admin, via `PATCH /admin/users/:id/role` ([api.md](./api.md)); there is no screen for it, deliberately |
| **Change the logo or home photo** | Admin → **Site images** |
| **Change a dish's photo** | Admin → Menu → **Edit** the dish → **Photo** |

---

## Maintenance

### Chat photos left behind
Deleting a conversation does not delete its photos. This only happens when its order is deleted (rare), but over time a
few files can be orphaned. To list them (SQL editor):

```sql
select o.name, o.created_at
from storage.objects o
where o.bucket_id = 'chat-images'
  and not exists (select 1 from public.chat_threads t where t.id::text = split_part(o.name, '/', 1));
```

Delete them from the Supabase **Storage** page, or with a small script using the storage API
(`supabaseAdmin.storage.from('chat-images').remove([...names])`). Do not delete rows from `storage.objects` with SQL.

### Old guest conversations
Guest chats are kept indefinitely. If the inbox gets long, old conversations can be deleted (their photos first, as
above). There is no automatic clean-up yet; see [security.md](./security.md#known-gaps-and-accepted-risks).

### Database changes
Only through new migration files ([architecture.md](./architecture.md#database)). Run them in the SQL editor in order,
then confirm with the advisors. After a schema change, update [data-dictionary.md](./data-dictionary.md).

### Rotating keys
- **Supabase keys:** create the new keys in the dashboard, update `backend/.env` (and the publishable key in
  `frontend/.env`, then rebuild), restart the API, then disable the old keys.
- **PayMongo:** update `PAYMONGO_SECRET_KEY`; for the webhook secret, update it in PayMongo and `PAYMONGO_WEBHOOK_SECRET`
  together, or notifications will be refused until they match.

### Dependencies
`npm outdated` / `npm audit` in `backend/` and `frontend/` from time to time; update, run `npm test` and
`npm run build`, then redeploy. Pin nothing to "latest" in production.

### Backups
Confirm they run; **practise a restore** into a scratch project, since an untested backup is a hope, not a backup.

---

## Troubleshooting

### Starting up

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| API exits with "Invalid environment configuration" | A required variable in `backend/.env` is missing or malformed | Fix what it lists; see [deployment.md](./deployment.md#environment-variables) |
| `EADDRINUSE … :4000` | Another API is already running (often a second `npm run dev`) | Stop the other one (`ss -ltnp \| grep :4000` shows which). The first one is fine to keep |
| Vite says port 5173 is in use | Another frontend dev server is running. The port is fixed on purpose (CORS and GCash return addresses expect it) | Stop the other one |
| Page is blank in development and the console says "does not provide an export named 'default'" | Vite cached a file while it was half-saved | Save the file again, or restart `npm run dev` |
| App shows "Cannot reach the server" | API not running, wrong `VITE_API_URL`, or `CORS_ORIGIN` does not include the website's address | Check `/health`, the `.env` values, and rebuild the frontend after changing `VITE_*` |
| First request is very slow | The Supabase project was idle and is waking | Normal; later requests are fast |

### Logging in

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Cashier or kiosk password refused 10 times then "Too many attempts" | The limit is 10 wrong guesses per 15 minutes per address (correct logins are not counted) | Wait 15 minutes, or restart the API in development |
| Everyone suddenly gets "Too many requests" | Many users share one address and `TRUST_PROXY` is too low, or genuinely too much traffic | Set `TRUST_PROXY` to the number of proxies; raise `RATE_LIMIT_MAX` if needed |
| "Continue with Google" lands on a Supabase error page | Google is not enabled, or the site's `/auth/callback` is not in Supabase's redirect URLs | [getting-started.md](./getting-started.md#optional-google-sign-in) |
| Google works, then the next page asks to log in again | An expired or revoked session | Sign in again. If it recurs, clear the site's data and report it |
| A new customer sees "Wrong account" | They are signed in as staff in the same browser | Sign out and use the right account |
| A rider is told their account is deactivated | An admin switched it off | Admin → Riders → reactivate |
| Can't remember the admin or cashier password | | Re-run `seed-accounts` with new `SEED_…` values (see above) |

### Orders and payments

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| GCash buttons say "not configured" (503) | No PayMongo keys | [deployment.md](./deployment.md#gcash-paymongo); cash still works |
| Customer paid by GCash but the order is still unpaid | The notification did not arrive or was rejected | Check PayMongo's webhook log, the API log lines starting `[paymongo]`, and that the signing secret matches. A failed delivery is retried by PayMongo |
| "GCash requires a minimum of PHP 20.00" | PayMongo's rule | Take cash for small orders |
| "A GCash payment for this order is still going through" | The customer's payment is completing | Wait a moment and check the order again |
| Void fails on a paid GCash order | The refund could not be issued; the order is deliberately **not** voided while money is held | Try again, or retry from Admin → Orders |
| "Order is no longer available to claim" | Another rider took it first | Normal |
| Can't edit an order | It has started cooking, or a payment has started (the amount is fixed) | Void and re-enter it |
| "Cannot be deleted" / "appears in past orders" (menu) | Ordered dishes and options are kept for history | Mark the dish **Sold out**, or clear the option's price |
| A dish can't be ordered: "Price not yet set" | The dish or size has no price | Set one in Admin → Menu |
| Sales page shows nothing but orders exist | Only **paid** orders that are not voided or cancelled count, by the **Manila day they were placed** | See [how-it-works.md](./how-it-works.md#sales-report); check the date range |
| Phone number rejected | It must be 11 digits starting `09`, digits only | `09171234567` |

### Chat, photos and the map

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| A guest cannot attach a photo | Photos need an existing conversation | Send a first text message |
| "Unsupported image" | Only JPEG, PNG and WebP are accepted (not GIF, and some phone formats such as HEIC) | Use a JPEG or PNG, or take the photo again |
| "Sending photos too fast" | A guest may send 10 photos per 10 minutes | Wait |
| "This conversation has reached its limit of 30 photos" | Per-conversation cap | Start a new conversation |
| A photo in an old chat shows broken | Its temporary link expired | Reload the conversation; fresh links are issued |
| Delivery chat says it opens when a rider picks up the order | No rider holds it yet (or the delivery is finished) | Expected |
| Messages arrive late | The live connection dropped | They still arrive within about 20 seconds by the safety refresh |
| Map is grey, or the address does not fill in | No internet, a blocked request, or the free lookup service being busy | Tap the map and type the address; the order works either way |

### Tests

| Symptom | Fix |
| --- | --- |
| "Cannot run the test suite: accounts could not sign in" | Re-run both seed scripts ([testing.md](./testing.md#prerequisites)) |
| A run was interrupted and left rows behind | Delete leftover `Sales Test`, `Fake Pay` orders etc. by hand, or just run the suite again |
| Files left in `chat-images` after tests | A test leaked; see [Chat photos left behind](#chat-photos-left-behind) |

---

## Where to look

| What | Where |
| --- | --- |
| API log | The terminal or log of the process running `npm start`; request lines, `[paymongo]` payment events, `[chat]` and `[config]` warnings |
| API health | `GET /api/v1/health`, `GET /api/v1/health/supabase` |
| Database and auth logs, advisors | Supabase dashboard → Logs / Advisors |
| Payment notifications | PayMongo dashboard → Webhooks; and the `webhook_events` table |
| Who did what to an order | `orders` (`voided_by`, `void_reason`, `rider_id`, timestamps) and `payments` (`raw` holds who took cash, tendered, change) |
| Why a rule exists | [decisions.md](./decisions.md), [security.md](./security.md) |
