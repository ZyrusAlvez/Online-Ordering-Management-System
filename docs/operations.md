# Operations

Running the system day to day, keeping it healthy, and fixing it when something is wrong.

**Contents:** [Routine tasks](#routine-tasks) · [Staff and devices](#staff-and-devices) · [Maintenance](#maintenance) ·
[Troubleshooting](#troubleshooting) · [Where to look](#where-to-look)

---

## Routine tasks

### Opening
1. Open the site: the landing page shows the branches and the menu (that means the app and Supabase are both up).
2. Open `/cashier`, choose your branch (remembered on that device), enter its password, **Open register**. Check
   **Messages** for anything overnight.
3. Look at the **Scheduled** orders in the Active tab: online orders placed while you were closed are there, marked
   with their time (they turn orange an hour before).
4. Kiosks: make sure each one is on its start screen (it shows its branch). A locked kiosk needs its branch's kiosk
   password again.

### During service
- New orders and chats appear on their own. If a screen looks stale, the **Refresh** button is on the admin pages; the
  cashier and rider screens update live.
- Ran out of a dish? Admin → Menu, with your branch chosen at the top → **Mark sold out**. It disappears from your
  branch's menu (website, kiosk, register) at once; **Back on** returns it. Other branches are unaffected. Only the super
  admin can switch a dish off everywhere.
- Scheduled orders: start them around the time the banner says (30 minutes before). They sort by their time.
- An order shows **Awaiting verification**: the customer sent a GCash reference number or receipt. Open it, find the
  payment in the restaurant's GCash app (amount and reference number), then **Approve**, or **Reject** with a reason
  the customer will see.
- A customer shows a GCash receipt at the counter (walk-in or kiosk order): **GCash**, check the receipt is to our
  account for the right amount, type its reference number, **Mark paid**.
- A customer wants to cancel a paid order: **Void** it in the cashier screen with a reason. Hand cash back yourself;
  for GCash, send the money back from the restaurant's GCash, then Admin → Orders → **Mark refunded**.

### Closing
1. Open Admin → **Sales** → **Today**, with your branch chosen. Compare **Cash** with the drawer: cash sales on the Sales page should match
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
| **Open a new branch** | Super admin → Admin → **Branches** → **New branch** (name, code, pin on the map, hours). Then set its cashier and kiosk passwords (Employee passwords), create its riders, and give an admin access (Admins). It appears on the landing map at once |
| **Close a branch** | Super admin → Branches → **Edit** → untick **Open for orders**. It leaves the map and takes no new orders; its history stays |
| **Change a branch's hours, address or pin** | Super admin → Branches → **Edit**. Hours decide when "as soon as possible" is allowed and which times can be scheduled |
| **Add a branch admin** | Super admin → Admin → **Admins** → **New admin**, ticking the branches they run. **Branches** on their row changes them later (immediately); **Deactivate** locks them out |
| **Add a rider** | Admin → Riders → **New rider** (branch, name, email, temporary password, 11-digit phone). Tell them to log in at `/login` |
| **Remove a rider's access** | Admin → Riders → **Deactivate**. Takes effect on their very next request. Reactivate the same way |
| **Change the cashier or kiosk password** | Admin → **Employee passwords** → choose the branch. Cashier logins already open keep working until they sign out; kiosks already unlocked keep working until revoked. Setting a branch's cashier password the first time creates its register login |
| **Retire or lock out a kiosk** | Admin → Kiosks → **Revoke**. The terminal locks and asks for the password again |
| **Set up a new kiosk** | Open `/kiosk` on the device, choose the branch, enter that branch's kiosk password. It registers itself and appears in Admin → Kiosks |
| **Lock a kiosk from the device** | Tap the logo on the start screen five times quickly and confirm |
| **Forgot a cashier or kiosk password** | The super admin (or that branch's admin) sets a new one in Admin → **Employee passwords** |
| **Forgot the super admin password** | Supabase → Authentication → Users → the account → **Send password recovery**, or set a new password there |
| **Change someone's role** | There is no screen for it, deliberately. Admins are created from the Admins page and riders from Riders. Anything else is a developer task: set both `app_metadata.role` (Supabase → Authentication → the user) and `profiles.role`, which must agree |
| **Change the logo** | Super admin → **Site images** |
| **Change a dish, its price or photo** | Super admin → Menu → **Edit** the dish (the menu is shared by every branch) |

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
- **Supabase keys:** create the new keys in the dashboard, update `SUPABASE_SECRET_KEY` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` on the host, redeploy, then disable the old keys.
- **GCash account:** change the `NEXT_PUBLIC_GCASH_*` settings and redeploy. Put a new QR image in `public/brand/` or
  host it anywhere and use its URL.

### Dependencies
`npm outdated` / `npm audit` from time to time; update, run `npm run typecheck`, `npm run build` and
`npm run check:flows` (against a test project), then redeploy. Pin nothing to "latest" in production.

### Backups
Confirm they run; **practise a restore** into a scratch project, since an untested backup is a hope, not a backup.

---

## Troubleshooting

### Starting up

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Every screen fails to load data, or sign-in says the key is invalid | `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is missing or wrong | Fix `.env.local` (or the host's settings) and restart `npm run dev` / redeploy; see [deployment.md](./deployment.md#environment-variables) |
| Cashier gate, kiosk, guest chat or the admin Riders/Kiosks/Sales pages fail, the rest works | `SUPABASE_SECRET_KEY` is missing or wrong on the server | Set it (server-side only) and restart |
| `npm run dev` says port 5173 is in use | Another dev server is running | Stop the other one (`ss -ltnp \| grep :5173` shows which) |
| App shows "Cannot reach the server" | The browser is offline, or Supabase is unreachable | Check the connection and the Supabase status page |
| First request is very slow | The Supabase project was idle and is waking | Normal; later requests are fast |

### Logging in

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| The right cashier or kiosk password is refused | The wrong **branch** is chosen on the gate, or that branch has no password yet | Pick the register's branch; an admin sets the branch's password in Employee passwords |
| An admin cannot see a branch, or a page (Branches, Admins, Site images) | They are not assigned to it; those pages are the super admin's | Super admin → Admins → **Branches** on their row |
| Everyone suddenly gets "Too many requests" | Many users share one address and `TRUST_PROXY` is too low, or genuinely too much traffic | Set `TRUST_PROXY` to the number of proxies; raise `RATE_LIMIT_MAX` if needed |
| "Continue with Google" lands on a Supabase error page | Google is not enabled, or the site's `/auth/callback` is not in Supabase's redirect URLs | [getting-started.md](./getting-started.md#optional-google-sign-in) |
| Google works, then the next page asks to log in again | An expired or revoked session | Sign in again. If it recurs, clear the site's data and report it |
| A new customer sees "Wrong account" | They are signed in as staff in the same browser | Sign out and use the right account |
| A rider is told their account is deactivated | An admin switched it off | Admin → Riders → reactivate |
| Can't remember the admin or cashier password | | See *Forgot a … password* in [Routine tasks](#routine-tasks) |

### Orders and payments

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| A customer can't order "as soon as possible" ("closed now, schedule your order") | The branch is outside its opening hours | Expected: they schedule a time. Check the hours in Branches if they look wrong |
| An order is missing from the cashier's queue | It was placed at another branch (the customer's chosen or nearest branch) | Find it in Admin → Orders with **All branches**; it can only be handled by its branch |
| A dish shows "Sold out" at one branch only | That branch marked it sold out | Admin → Menu, that branch chosen → **Back on** |
| GCash is missing from checkout and the kiosk, or answers "not available" (503) | `NEXT_PUBLIC_GCASH_NUMBER` is empty | Set the three `NEXT_PUBLIC_GCASH_*` settings and rebuild; cash still works |
| The GCash QR image is broken | `NEXT_PUBLIC_GCASH_QR_IMAGE` points at a file that is not there | Check the file is in `public/` (path) or the URL opens |
| Customer says they paid by GCash but the order is still unpaid | They have not sent the reference number/receipt yet, or it is **Awaiting verification** | Ask them to send it from their order page, or approve it in the cashier screen |
| "Verify or reject the GCash payment before voiding" | The customer's proof is waiting; the money may already be in | Check the GCash app, approve or reject, then void |
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
| Server action log | The terminal running `npm run dev` / `npm start`, or the host's function logs (Vercel → Logs) |
| Database and auth logs, advisors | Supabase dashboard → Logs / Advisors |
| Who did what to an order | `orders` (`voided_by`, `void_reason`, `rider_id`, timestamps) and `payments` (`raw` holds who took cash, tendered, change; `verified_by` is who approved a GCash payment) |
| Why a rule exists | [decisions.md](./decisions.md), [security.md](./security.md) |
