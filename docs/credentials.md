# Credentials

> **Development accounts.** Every password is **`<role>-<location>`** (the branch code: gma, dasma, langkaan, gentri,
> trece, silang, imus), and every email ends in `@3k.local`. Before going live, change every password, delete the
> `@3k.local` accounts, and remove this file.

## Super admin

Signs in at `/login`, lands on `/admin`. Sees every branch, plus Branches, Admins, the shared menu and the logo.

| Email | Password |
| --- | --- |
| `admin@3k.local` | `superadmin-all` |

## Admins

Sign in at `/login`, land on `/admin`. See only their own branches.

| Branches | Email | Password |
| --- | --- | --- |
| GMA Terminal | `admin.gma@3k.local` | `admin-gma` |
| Dasma Bayan | `admin.dasma@3k.local` | `admin-dasma` |
| Langkaan | `admin.langkaan@3k.local` | `admin-langkaan` |
| Gen-Tri | `admin.gentri@3k.local` | `admin-gentri` |
| Trece | `admin.trece@3k.local` | `admin-trece` |
| Silang | `admin.silang@3k.local` | `admin-silang` |
| Imus | `admin.imus@3k.local` | `admin-imus` |
| Dasma Bayan, Langkaan, Gen-Tri (area admin) | `admin.area@3k.local` | `admin-area` |

## Cashiers

Open `/cashier`, pick the branch, type the password (no email). Behind each gate is the branch's register account,
which can also sign in at `/login` with the same password.

| Branch | Password | Register account |
| --- | --- | --- |
| GMA Terminal | `cashier-gma` | `cashier@3k.local` |
| Dasma Bayan | `cashier-dasma` | `cashier.dasma@3k.local` |
| Langkaan | `cashier-langkaan` | `cashier.langkaan@3k.local` |
| Gen-Tri | `cashier-gentri` | `cashier.gentri@3k.local` |
| Trece | `cashier-trece` | `cashier.trece@3k.local` |
| Silang | `cashier-silang` | `cashier.silang@3k.local` |
| Imus | `cashier-imus` | `cashier.imus@3k.local` |

## Kiosks

Open `/kiosk`, pick the branch, type the password once per browser. Each unlock registers a device that an admin can
revoke in Admin → Kiosks.

| Branch | Password |
| --- | --- |
| GMA Terminal | `kiosk-gma` |
| Dasma Bayan | `kiosk-dasma` |
| Langkaan | `kiosk-langkaan` |
| Gen-Tri | `kiosk-gentri` |
| Trece | `kiosk-trece` |
| Silang | `kiosk-silang` |
| Imus | `kiosk-imus` |

## Riders

Sign in at `/login`, land on `/driver`. See only their branch's deliveries. The other branches have no rider yet
(create one in Admin → Riders).

| Branch | Email | Password |
| --- | --- | --- |
| GMA Terminal | `rider1@3k.local` | `rider-gma` |
| Imus | `rider.imus@3k.local` | `rider-imus` |

## Customers

Sign in at `/login`, land on `/menu`. Use both to check one customer can never see the other's orders or chats.

| Email | Password |
| --- | --- |
| `customer@3k.local` | `customer-1` |
| `customer2@3k.local` | `customer-2` |

Google sign-in also works with your own Google account (no password), once Google is enabled in Supabase. Visitors
need no account to browse, build a cart or chat.

## Changing them

| Login | Where |
| --- | --- |
| Cashier or kiosk password of a branch | Admin → **Employee passwords** |
| Riders | Admin → **Riders** |
| Admins | Admin → **Admins** (super admin) |
| Any account | Supabase → Authentication → Users |

`npm run check:flows` signs in with the GMA Terminal admin, cashier, kiosk, rider and both customers; if you change
those, change them in `scripts/dev/` too.
