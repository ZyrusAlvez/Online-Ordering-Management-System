# Testing

## Automatic

```bash
npm run typecheck      # TypeScript
npm run build          # also fails if a server-only module reaches the browser bundle
npm run check:flows    # end-to-end checks against the Supabase project in .env.local
```

`check:flows` runs `scripts/dev/check-orders.ts` and `check-server.ts`: they call the app's own controllers and server
actions as the accounts in [credentials.md](./credentials.md) and print `PASS`/`FAIL` per check.

| Script | Covers |
| --- | --- |
| `check-orders` | GCash order → proof → approve → void → refund; delivery through the kitchen → rider claim (second claim loses) → chat → cash on delivery (short cash refused); cancel; walk-in with change; profile; sold out. **Tampering:** marking own order paid, changing a total, fake item prices, adding items to a placed order, another customer's order. **Database ordering rules:** delivery without address, off-mark / too-soon / too-far / out-of-hours times, ASAP while closed |
| `check-server` | Cashier gate; kiosk unlock, order, revocation; guest chat → inbox → reply; receipt upload (non-image refused); password change; sales report; branch isolation for admins; the rate-limit counter and that browsers can't touch it |

It **writes real rows** (test orders at GMA Terminal, chats, a kiosk device it revokes). Use a separate project when you
can, never production. Limits counted per IP need a real web request, so the scripts test the counter with their own
keys.

After a build, check the secret key never reached the browser:

```bash
grep -rlF "$(grep '^SUPABASE_SECRET_KEY=' .env.local | cut -d= -f2-)" .next/static || echo "clean"
```

## By hand

Logins are in [credentials.md](./credentials.md). Use two browsers (or a private window) when two people are involved.

| Role | Try |
| --- | --- |
| Visitor | `/`: map framed on all branches; allow location → **Nearest to you**; **Order here** on another branch; add dishes → **Checkout** → login → back at checkout with the cart; **Chat with us** |
| Customer | Pickup and delivery (map pin, phone required); ASAP and **Schedule for later**; cash order → **My orders** updates live; cancel an unpaid order; GCash: send a reference (e.g. `1012 345 678901`) or receipt → **Awaiting verification**; profile edits prefill checkout |
| Cashier | `/cashier` GMA Terminal: new orders arrive live; scheduled orders amber; Confirm → Preparing → Ready → Complete; Edit items; Void; **Walk-in** with cash (change) or GCash; Approve/Reject GCash; **Messages** |
| Rider | Customer places a delivery, cashier marks it ready → `rider.gma` sees it under **Available** (Imus rider doesn't) → Claim → Chat → Mark delivered with cash |
| Kiosk | `/kiosk` GMA Terminal → Touch to order → dine in → pay cash or GCash; revoke it in Admin → Kiosks and it locks |
| Admins | Super admin: Sales ranges and **By branch**, Orders filters and **Mark refunded**, Menu edits and photos, **Mark sold out** per branch, Branches, Admins, Riders, Kiosks, Employee passwords, Site images. `admin.area` sees only its three branches; a branch admin only theirs |

**Isolation checks:** Customer 2 can't see Customer's orders or chats; a GMA register never shows an Imus order; the
area admin and the Langkaan register both see a Langkaan order, neither sees Silang's.

Test data: mobile numbers are 11 digits starting `09`; ASAP only during branch hours (seeded 08:00–21:00); the maps
need internet. If you change a password in Employee passwords, change it back (or update credentials.md).
