# Testing

How the system is checked: the static checks, the end-to-end flow checks against Supabase, and testing by hand.

---

## Static checks

```bash
npm run typecheck     # TypeScript over src/ and scripts/
npm run build         # the production build; also fails if a server-only module ends up in the browser bundle
```

After a build, confirm the secret key never reached the browser:

```bash
grep -rlF "$(grep '^SUPABASE_SECRET_KEY=' .env.local | cut -d= -f2-)" .next/static || echo "clean"
```

## Flow checks (`npm run check:flows`)

Two scripts drive the app's **own controllers and server actions** (the code the screens call) against the Supabase
project in `.env.local`, signed in as the `@3k.local` accounts from [test-accounts.md](./test-accounts.md). Each line
prints `PASS` or `FAIL`; the run ends with `ALL PASSED` or the number of failures.

| Script | Covers |
| --- | --- |
| `scripts/dev/check-orders.ts` | Online GCash order → proof → cashier approves → void → admin refunds; delivery order through the kitchen steps → rider pool → claim (a second claim loses) → chat both ways → cash on delivery (short cash refused); a customer cancels; a walk-in order with change; profile edit; sold out. **Tampering:** a customer cannot mark their order paid, change a total, slip in a fake item price, or change their own role; another customer cannot see the order |
| `scripts/dev/check-server.ts` | Cashier gate (wrong password 401, session adopted); kiosk unlock, order and revocation (a revoked key gets 403); guest chat → cashier inbox → reply; a receipt uploaded to the private bucket, a non-image refused, a signed link for staff, rejection with a reason; password change (wrong current password is 400); sales report; a branch admin sees no other branch's kiosks and cannot list admins |

**What it does to the database:** it writes real rows as the test accounts: a few orders at GMA Terminal (left
refunded, completed, cancelled or rejected), chat messages, one guest conversation, and a kiosk device it revokes at the
end. Run it against a **separate** Supabase project when you can, never against production with real customers. The
test accounts in [test-accounts.md](./test-accounts.md) must exist (they do in the demo project).

The scripts run under `tsx` with the `react-server` condition, so the server-only modules load outside Next.js.

## By hand

[test-accounts.md](./test-accounts.md) lists every login and a walkthrough per role (visitor, customer, cashier,
kiosk, rider, admin, super admin). Use it for what the scripts cannot see: the screens, maps, live updates, photos and
Google sign-in.

## Known limits

- There is no isolated test database: the checks run against whichever project `.env.local` points at.
- The checks call the controllers directly, not through a browser, so layout and click-through problems need a person.
- Limits counted per IP need a web request (the scripts have no visitor IP), so `check:flows` tests the counter
  itself with its own keys. The per-IP gate limit was checked once in a browser.
