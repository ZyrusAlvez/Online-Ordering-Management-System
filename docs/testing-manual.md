# Manual testing with curl

How to drive every endpoint by hand with `curl`, to explore the API or debug a
specific call. Assumes the repo is set up and `.env` is filled in.

For the automated suite (525 tests on Node's built-in runner) see
**[testing.md](./testing.md)**. Run that first if you only
want to know whether something is broken; come here when you want to poke at a
particular endpoint yourself.

---

## 0. Start the server

```bash
cd backend
npm install
npm run dev          # http://localhost:4000/api/v1
```

Confirm it is alive and can reach Supabase:

```bash
curl localhost:4000/api/v1/health
curl localhost:4000/api/v1/health/supabase
```

```json
{ "status": "ok", "env": "development", "uptime": 3.1, "timestamp": "…" }
```

If `/health/supabase` returns `503`, your `SUPABASE_URL` / `SUPABASE_SECRET_KEY`
are wrong. If the server refuses to boot it will print exactly which env var
failed validation.

> **First request after the Supabase project has been idle can take 10–20
> seconds** while the database wakes. That is the platform, not the API — give
> your first `curl` a generous `--max-time` and it settles to ~120ms after.

---

## 1. Create the accounts

You need the super admin and GMA Terminal's cashier. This also saves their passwords into `.env`
(as `TEST_ADMIN_PASSWORD` / `TEST_CASHIER_PASSWORD`), which is where `npm test`
reads them from. Re-running is safe — it keeps the passwords already in `.env`
instead of rotating them:

```bash
node --env-file=.env scripts/seed-accounts.mjs
```

```
✓ Super admin                  admin@3k.local  role=super_admin
✓ Cashier (GMA shared login)   cashier@3k.local  role=cashier

Generated passwords — copy these now, they are not stored anywhere:
  admin@3k.local           egRRyNLgElq60gQP
  cashier@3k.local         6hLgAeJ_hTKBBLNn
```

Choose your own instead:

```bash
SEED_ADMIN_PASSWORD='…' SEED_CASHIER_PASSWORD='…' \
  node --env-file=.env scripts/seed-accounts.mjs
```

For customers, riders and a second branch's staff to test with:

```bash
node --env-file=.env scripts/dev/seed-test-users.mjs
# customer@, customer2@, rider1@ (GMA Terminal), and admin.imus@, cashier.imus@, rider.imus@ (Imus),
# all @3k.local with password testpass12345
```

The branches come from the migrations. Keep their ids handy:

```bash
GMA=$(curl -s localhost:4000/api/v1/branches | python3 -c 'import json,sys; print(next(b["id"] for b in json.load(sys.stdin)["data"] if b["code"]=="gma"))')
IMUS=$(curl -s localhost:4000/api/v1/branches | python3 -c 'import json,sys; print(next(b["id"] for b in json.load(sys.stdin)["data"] if b["code"]=="imus"))')
```

> **Why not just `POST /auth/register`?** Supabase rate-limits signups per IP
> and rejects reserved domains like `example.com`. You will hit `429` after a
> few attempts. The seed scripts use the admin API, which bypasses both.

---

## 2. Get a token

Every authenticated call needs `Authorization: Bearer <access_token>`.

```bash
TOKEN=$(curl -s -X POST localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"cashier@3k.local","password":"6hLgAeJ_hTKBBLNn"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["session"]["access_token"])')

echo "${TOKEN:0:20}…"
```

Sanity-check who you are, and confirm the role claim:

```bash
curl -s localhost:4000/api/v1/auth/me -H "Authorization: Bearer $TOKEN" \
  | python3 -m json.tool | head -20
```

Tokens last an hour. When calls start returning `401`, log in again.

Keep several in one shell to switch roles quickly:

```bash
login() {
  curl -s -X POST localhost:4000/api/v1/auth/login -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["session"]["access_token"])'
}
ADMIN=$(login admin@3k.local 'egRRyNLgElq60gQP')
CASHIER=$(login cashier@3k.local '6hLgAeJ_hTKBBLNn')
CUSTOMER=$(login customer@3k.local testpass12345)
RIDER=$(login rider1@3k.local testpass12345)
```

---

## 3. Read the menu, and grab real product IDs

```bash
curl -s localhost:4000/api/v1/menu | python3 -m json.tool | head -40
```

Pull two IDs you will reuse — one flat-priced, one variant-priced:

```bash
eval $(curl -s localhost:4000/api/v1/menu | python3 -c '
import json, sys
items = [p for c in json.load(sys.stdin)["data"] for p in c["products"]]
flat = next(p for p in items if p["name"] == "Tapsilog")
var  = next(p for p in items if p["name"] == "Lechon Kawali")
size = next(v for v in var["variants"] if v["label"] == "500g")
print("TAPSILOG=" + flat["id"])
print("LECHON=" + var["id"])
print("LECHON_500G=" + size["id"])
')
echo "$TAPSILOG / $LECHON / $LECHON_500G"
```

---

## 4. Walk the kiosk → POS cash flow

This is the main in-store path.

### 4a. Issue a kiosk device key (admin)

```bash
curl -s -X POST localhost:4000/api/v1/admin/kiosks \
  -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Lobby Kiosk 1\",\"branch_id\":\"$GMA\"}" | python3 -m json.tool
```

Copy `data.key` — it is shown **once**:

```bash
KIOSK_KEY='kiosk_…'
```

Confirm the key is enforced:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:4000/api/v1/kiosk/orders \
  -H 'Content-Type: application/json' -d '{}'                      # 401, no key
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:4000/api/v1/kiosk/orders \
  -H 'X-Kiosk-Key: kiosk_bogus' -H 'Content-Type: application/json' -d '{}'   # 401
```

### 4b. Place a kiosk order

```bash
curl -s -X POST localhost:4000/api/v1/kiosk/orders \
  -H "X-Kiosk-Key: $KIOSK_KEY" -H 'Content-Type: application/json' \
  -d "{
    \"fulfillment_type\": \"dine_in\",
    \"customer_name\": \"Ana Reyes\",
    \"payment_method\": \"cash\",
    \"items\": [
      { \"product_id\": \"$TAPSILOG\", \"quantity\": 2 },
      { \"product_id\": \"$LECHON\", \"variant_id\": \"$LECHON_500G\", \"quantity\": 1 }
    ]
  }" | python3 -m json.tool | head -30
```

Check: `order_number` like `K-0001`, `status: "pending"`,
`payment_status: "unpaid"`, and `total_amount` of `480` (2×100 + 280).

```bash
ORDER=<the id from the response>
```

### 4c. Find it at the till (cashier)

```bash
curl -s "localhost:4000/api/v1/pos/orders?q=Ana" -H "Authorization: Bearer $CASHIER" \
  | python3 -c 'import json,sys; [print(o["order_number"], o["customer_name"], o["total_amount"]) for o in json.load(sys.stdin)["data"]]'
```

`q` matches the order number too — try `?q=K-0001`.

### 4d. Modify, confirm, cook

```bash
# customer drops the lechon
curl -s -X PATCH "localhost:4000/api/v1/pos/orders/$ORDER/items" \
  -H "Authorization: Bearer $CASHIER" -H 'Content-Type: application/json' \
  -d "{\"items\":[{\"product_id\":\"$TAPSILOG\",\"quantity\":2}]}" \
  | python3 -c 'import json,sys; print("total now", json.load(sys.stdin)["data"]["total_amount"])'
# → 200

# skipping a stage is rejected
curl -s -X PATCH "localhost:4000/api/v1/pos/orders/$ORDER/status" \
  -H "Authorization: Bearer $CASHIER" -H 'Content-Type: application/json' \
  -d '{"status":"ready"}'
# → 409 "Cannot move an order from pending to ready (allowed: confirmed, preparing)"

curl -s -X POST "localhost:4000/api/v1/pos/orders/$ORDER/confirm" -H "Authorization: Bearer $CASHIER" -o /dev/null -w '%{http_code}\n'
for s in preparing ready; do
  curl -s -X PATCH "localhost:4000/api/v1/pos/orders/$ORDER/status" \
    -H "Authorization: Bearer $CASHIER" -H 'Content-Type: application/json' \
    -d "{\"status\":\"$s\"}" -o /dev/null -w "$s %{http_code}\n"
done
```

### 4e. Take the cash

```bash
# underpaying is rejected
curl -s -X POST "localhost:4000/api/v1/pos/orders/$ORDER/payment/cash" \
  -H "Authorization: Bearer $CASHIER" -H 'Content-Type: application/json' \
  -d '{"tendered_amount": 50}'
# → 400

curl -s -X POST "localhost:4000/api/v1/pos/orders/$ORDER/payment/cash" \
  -H "Authorization: Bearer $CASHIER" -H 'Content-Type: application/json' \
  -d '{"tendered_amount": 500}' | python3 -m json.tool | tail -8
# → payment_status "paid", meta.change 300
```

Then `PATCH …/status` to `completed`.

---

## 5. Walk the online → rider delivery flow

```bash
# customer orders for delivery
curl -s -X POST localhost:4000/api/v1/orders \
  -H "Authorization: Bearer $CUSTOMER" -H 'Content-Type: application/json' \
  -d "{
    \"branch_id\": \"$GMA\",
    \"fulfillment_type\": \"delivery\",
    \"payment_method\": \"cash\",
    \"customer_phone\": \"09171234567\",
    \"delivery_address\": { \"line1\": \"9 Mabini St\", \"city\": \"Davao City\" },
    \"items\": [{ \"product_id\": \"$TAPSILOG\", \"quantity\": 1 }]
  }" | python3 -m json.tool | head -20

DELIVERY=<id>
```

Forgetting the address, or the mobile number, is rejected: drop `delivery_address` or `customer_phone` and you get a
`400` naming the field. Outside GMA Terminal's hours (08:00–21:00 Manila) the order is refused with `409` until you
add a time, for example `\"scheduled_for\": \"2026-10-11T00:15:00Z\"` (8:15 AM Manila; a 15-minute mark, at least
30 minutes ahead, within two days). The number must be 11 digits starting `09` (`09171234567`); an optional map pin goes in the
address as `"latitude": 14.2985, "longitude": 120.997`.

```bash
# cashier pushes it to ready
curl -s -X POST "localhost:4000/api/v1/pos/orders/$DELIVERY/confirm" -H "Authorization: Bearer $CASHIER" -o /dev/null
for s in preparing ready; do
  curl -s -X PATCH "localhost:4000/api/v1/pos/orders/$DELIVERY/status" \
    -H "Authorization: Bearer $CASHIER" -H 'Content-Type: application/json' -d "{\"status\":\"$s\"}" -o /dev/null
done

# rider sees and claims it
curl -s localhost:4000/api/v1/rider/pool -H "Authorization: Bearer $RIDER" \
  | python3 -c 'import json,sys; [print(o["order_number"], o["delivery_address"]) for o in json.load(sys.stdin)["data"]]'

curl -s -X POST "localhost:4000/api/v1/rider/orders/$DELIVERY/claim" -H "Authorization: Bearer $RIDER" -o /dev/null -w '%{http_code}\n'
curl -s -X POST "localhost:4000/api/v1/rider/orders/$DELIVERY/claim" -H "Authorization: Bearer $RIDER" -o /dev/null -w '%{http_code}\n'
# → 200 then 409: it is already claimed
```

Finish, collecting the cash:

```bash
curl -s -X POST "localhost:4000/api/v1/rider/orders/$DELIVERY/delivered" \
  -H "Authorization: Bearer $RIDER" -H 'Content-Type: application/json' -d '{}'
# → 400, collected_amount required for COD

curl -s -X POST "localhost:4000/api/v1/rider/orders/$DELIVERY/delivered" \
  -H "Authorization: Bearer $RIDER" -H 'Content-Type: application/json' \
  -d '{"collected_amount": 100}' \
  | python3 -c 'import json,sys; d=json.load(sys.stdin)["data"]; print(d["status"], d["payment_status"])'
# → completed paid
```

---

## 6. Check the authorization boundaries

Every one of these must be `403`:

```bash
curl -s -o /dev/null -w 'customer→POS   %{http_code}\n' localhost:4000/api/v1/pos/orders   -H "Authorization: Bearer $CUSTOMER"
curl -s -o /dev/null -w 'cashier→rider  %{http_code}\n' localhost:4000/api/v1/rider/pool   -H "Authorization: Bearer $CASHIER"
curl -s -o /dev/null -w 'cashier→admin  %{http_code}\n' localhost:4000/api/v1/admin/kiosks -H "Authorization: Bearer $CASHIER"
curl -s -o /dev/null -w 'rider→POS      %{http_code}\n' localhost:4000/api/v1/pos/orders   -H "Authorization: Bearer $RIDER"
```

And across branches (with `IMUS_ADMIN` and `IMUS_CASHIER` logged in like above), `403` for asking for GMA and `404`
for one of its orders:

```bash
IMUS_ADMIN=$(login admin.imus@3k.local testpass12345)
IMUS_CASHIER=$(login cashier.imus@3k.local testpass12345)
curl -s -o /dev/null -w 'imus admin→GMA orders  %{http_code}\n' "localhost:4000/api/v1/admin/orders?branch_id=$GMA" -H "Authorization: Bearer $IMUS_ADMIN"
curl -s -o /dev/null -w 'imus admin→branches    %{http_code}\n' localhost:4000/api/v1/admin/branches -H "Authorization: Bearer $IMUS_ADMIN"
curl -s -o /dev/null -w 'imus cashier→GMA order %{http_code}\n' "localhost:4000/api/v1/pos/orders/$ORDER" -H "Authorization: Bearer $IMUS_CASHIER"
```

And with no token at all, `401`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' localhost:4000/api/v1/orders
```

---

## 7. Test GCash without a PayMongo account

The webhook half is fully testable offline — start the server with a known
signing secret and sign your own payloads:

```bash
PAYMONGO_WEBHOOK_SECRET=whsk_testsecret123 node --env-file=.env src/server.js
```

In another shell:

```bash
node --env-file=.env scripts/dev/check-webhook.mjs
```

It seeds a kiosk order in `processing`, then asserts that a wrong secret, a
tampered body, a stale timestamp and a missing signature are each rejected;
that a valid `payment.paid` marks the order paid **and auto-confirms a kiosk
order to the kitchen**; that a repeat delivery of the same event is skipped;
and that `payment.failed` does not confirm anything.

The outbound half (creating payment intents) needs real credentials. Without
`PAYMONGO_SECRET_KEY`, GCash endpoints return a clear `503`:

```bash
curl -s -X POST "localhost:4000/api/v1/pos/orders/$ORDER/payment/gcash" -H "Authorization: Bearer $CASHIER"
# → 503 "GCash payments are not configured (PAYMONGO_SECRET_KEY is unset)"
```

When you do have keys, register your webhook with PayMongo pointing at
`POST https://<your-host>/api/v1/webhooks/paymongo` and subscribe to
`payment.paid`, `payment.failed` and `refund.updated`. Locally, expose the port
with a tunnel (ngrok or similar) — PayMongo cannot reach `localhost`.

---

## 8. Run the automated suite instead

Everything above is covered by the test suite, plus the concurrency cases that
are impractical to trigger by hand:

```bash
npm test
```

See **[testing.md](./testing.md)** for the layout, what is
covered, and how to add a test.

Three standalone diagnostic scripts also remain, useful on their own:

```bash
# every role sees exactly its permitted slice (this also proves Realtime scoping)
node --env-file=.env scripts/dev/check-rls.mjs

# webhook signatures, replay rejection, idempotency (server needs the test secret)
node --env-file=.env scripts/dev/check-webhook.mjs

# both business flows end to end
node scripts/dev/e2e.mjs                            # needs `npm run dev` running
```

**`check-rls.mjs` is the one to re-run after touching any policy or role.**
Realtime delivers exactly the rows a plain select would return for that user,
so if row-level security is wrong, every live queue silently shows the wrong
orders.

---

## 9. Reset to a clean slate

Wipe transactional data but keep the menu and accounts:

```sql
delete from public.orders;          -- order_items cascade
delete from public.order_counters;  -- order numbers restart at 0001
delete from public.webhook_events;
```

Rebuild the menu from source:

```bash
node supabase/generate-seed.mjs     # menu.json → seed.sql
```

then run `supabase/seed.sql`. It is idempotent, so re-running never duplicates.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| First request hangs ~20s | Supabase project waking from idle. Normal; subsequent calls are fast. |
| `429` on `/auth/register` | Supabase's signup limit. Use the seed scripts. |
| `429` on the cashier or kiosk password | 10 wrong guesses in 15 minutes per address. Wait, or restart the server in development. |
| `400` mentioning `customer_phone` | The number must be 11 digits starting `09`. |
| `"Email address … is invalid"` | Supabase rejects reserved domains such as `example.com`. |
| `403` with a valid token | Wrong role. Decode the JWT payload and check `app_metadata.role`. |
| `409 Price not yet set` | The product or variant has a null price (e.g. Softdrinks). Set one. |
| `401` on the webhook | Signing secret mismatch, or the body was re-serialised. The route must stay mounted **before** `express.json()`. |
| Realtime delivers nothing | The client must carry the user's access token; row-level security returns nothing to an anonymous socket. |
