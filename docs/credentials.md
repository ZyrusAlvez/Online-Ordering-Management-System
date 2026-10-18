# Credentials

> **Development only.** These logins exist in the demo Supabase project. Before going live, change every password,
> delete the `@3k.local` accounts, and remove this file (or keep the repository private).

## Staff of each branch

Cashier and kiosk are **shared passwords per branch**: open `/cashier` or `/kiosk`, pick the branch, type the
password. Branch admins sign in at `/login`.

| Branch | Admin (`/login`, password `testpass12345`) | Cashier (`/cashier`) | Kiosk (`/kiosk`) |
| --- | --- | --- | --- |
| GMA Terminal | `admin.gma@3k.local` | `cashier123` | `kiosk123` |
| Dasma Bayan | `admin.dasma@3k.local` | `cashier-dasma` | `kiosk-dasma` |
| Langkaan | `admin.langkaan@3k.local` | `cashier-langkaan` | `kiosk-langkaan` |
| Gen-Tri | `admin.gentri@3k.local` | `cashier-gentri` | `kiosk-gentri` |
| Trece | `admin.trece@3k.local` | `cashier-trece` | `kiosk-trece` |
| Silang | `admin.silang@3k.local` | `cashier-silang` | `kiosk-silang` |
| Imus | `admin.imus@3k.local` | `testpass12345` | `kiosk-imus` |

Behind each cashier gate is a register account: `cashier@3k.local` for GMA Terminal, `cashier.<code>@3k.local` for the
others (e.g. `cashier.dasma@3k.local`). The gate password is that account's password, so it also works at `/login`.

## Everyone else

| Role | Email | Password | Lands on | Access |
| --- | --- | --- | --- | --- |
| Super admin | `admin@3k.local` | `admin-3k-2026` | `/admin` | Every branch, plus branches, admins, the shared menu and the logo |
| Area admin | `admin.area@3k.local` | `testpass12345` | `/admin` | Dasma Bayan, Langkaan and Gen-Tri only |
| Rider (GMA Terminal) | `rider1@3k.local` | `testpass12345` | `/driver` | GMA Terminal's deliveries |
| Rider (Imus) | `rider.imus@3k.local` | `testpass12345` | `/driver` | Imus's deliveries |
| Customer | `customer@3k.local` | `testpass12345` | `/menu` | Ordering, own orders, profile |
| Customer 2 | `customer2@3k.local` | `testpass12345` | `/menu` | Same; use it to check customers can't see each other's orders |
| Google customer | your Google account | (none) | `/menu` | Needs Google enabled in Supabase |
| Visitor | (no account) | | `/` | Browse, cart, chat; asked to log in at checkout |

## Changing them

| Login | Where |
| --- | --- |
| Cashier or kiosk password of a branch | Admin → **Employee passwords** |
| Riders | Admin → **Riders** |
| Admins | Admin → **Admins** (super admin) |
| Any account | Supabase → Authentication → Users |

`npm run check:flows` signs in with these logins; if you change one, change it in `scripts/dev/` too.
