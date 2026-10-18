# Credentials

> **Demo accounts only.** Every demo password follows one pattern, **`demo-<role>-<name>`**, so a demo login is
> obvious at a glance. Emails end in `@3k.local`. Before going live, change every password, delete the `@3k.local`
> accounts, and remove this file.

## Super admin

Signs in at `/login`, lands on `/admin`. Sees every branch, plus Branches, Admins, the shared menu and the logo.

| Email | Password |
| --- | --- |
| `admin@3k.local` | `demo-superadmin` |

## Admins

Sign in at `/login`, land on `/admin`. See only their own branches.

| Branches | Email | Password |
| --- | --- | --- |
| GMA Terminal | `admin.gma@3k.local` | `demo-admin-gma` |
| Dasma Bayan | `admin.dasma@3k.local` | `demo-admin-dasma` |
| Langkaan | `admin.langkaan@3k.local` | `demo-admin-langkaan` |
| Gen-Tri | `admin.gentri@3k.local` | `demo-admin-gentri` |
| Trece | `admin.trece@3k.local` | `demo-admin-trece` |
| Silang | `admin.silang@3k.local` | `demo-admin-silang` |
| Imus | `admin.imus@3k.local` | `demo-admin-imus` |
| Dasma Bayan, Langkaan, Gen-Tri (area admin) | `admin.area@3k.local` | `demo-admin-area` |

## Cashiers

Open `/cashier`, pick the branch, type the password (no email). Behind each gate is the branch's register account,
which can also sign in at `/login` with the same password.

| Branch | Password | Register account |
| --- | --- | --- |
| GMA Terminal | `demo-cashier-gma` | `cashier@3k.local` |
| Dasma Bayan | `demo-cashier-dasma` | `cashier.dasma@3k.local` |
| Langkaan | `demo-cashier-langkaan` | `cashier.langkaan@3k.local` |
| Gen-Tri | `demo-cashier-gentri` | `cashier.gentri@3k.local` |
| Trece | `demo-cashier-trece` | `cashier.trece@3k.local` |
| Silang | `demo-cashier-silang` | `cashier.silang@3k.local` |
| Imus | `demo-cashier-imus` | `cashier.imus@3k.local` |

## Kiosks

Open `/kiosk`, pick the branch, type the password once per browser. Each unlock registers a device that an admin can
revoke in Admin → Kiosks.

| Branch | Password |
| --- | --- |
| GMA Terminal | `demo-kiosk-gma` |
| Dasma Bayan | `demo-kiosk-dasma` |
| Langkaan | `demo-kiosk-langkaan` |
| Gen-Tri | `demo-kiosk-gentri` |
| Trece | `demo-kiosk-trece` |
| Silang | `demo-kiosk-silang` |
| Imus | `demo-kiosk-imus` |

## Riders

Sign in at `/login`, land on `/driver`. See only their branch's deliveries. The other branches have no rider yet
(create one in Admin → Riders).

| Branch | Email | Password |
| --- | --- | --- |
| GMA Terminal | `rider1@3k.local` | `demo-rider-gma` |
| Imus | `rider.imus@3k.local` | `demo-rider-imus` |

## Customers

Sign in at `/login`, land on `/menu`. Use both to check one customer can never see the other's orders or chats.

| Email | Password |
| --- | --- |
| `customer@3k.local` | `demo-customer-1` |
| `customer2@3k.local` | `demo-customer-2` |

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
