# Database

Every table, field rule and access rule. The SQL is in `supabase/migrations/` (applied in order, never edited once
applied).

## Conventions

- Ids are `uuid` (`gen_random_uuid()`), except pair keys and `order_counters`, `site_images`, `employee_credentials`, `rate_limits`.
- Times are `timestamptz`; the business day is **Asia/Manila**.
- Prices and totals are `numeric(10,2)` pesos, max 999,999.99; `payments.amount_centavos` is integer centavos.
- Text is trimmed; only-spaces counts as empty.
- Orders are never deleted: `cancelled` (customer) or `voided` (staff). Ordered products can't be deleted; switch them off.
- Every table has RLS on.

## Input rules

Enforced in the form (`src/utils/validation.ts`), the controller (`src/utils/validators/fields.ts`) and the database
(`CHECK`), unless noted. Change all three together.

| Field | Rule |
| --- | --- |
| Mobile number | Exactly **11 digits starting `09`**, digits only (`09171234567`) |
| Email / account password | Valid, lower-cased, ≤ 254 / 8–72 characters (Supabase Auth) |
| Cashier / kiosk password | 6–200 characters, per branch |
| Branch | Name 1–80, code 2–30 of `a-z 0-9 -` (both unique); pin required; hours `HH:MM`, both or neither, closing after opening |
| Scheduled time | 15-minute mark, ≥ 30 min ahead, ≤ end of the day after tomorrow, inside branch hours (DB: online orders, 5 min grace) |
| Names | 1–120 (category 100, product 200, option label 100, choice 100) |
| Address | Street 1–300 and city 1–120 required for delivery; barangay ≤ 120, landmark ≤ 300, notes ≤ 500 (app only) |
| Map pin | Latitude 4–22, longitude 116–128 (the Philippines), both or neither (DB: ±90/±180) |
| Notes | Order ≤ 1,000; line ≤ 500 (app only); void reason 1–500; description ≤ 2,000 |
| GCash reference | 6–40 letters, digits, single spaces |
| Money | ≥ 0, ≤ 999,999.99, 2 decimals |
| Quantities | 1–99 per line; 1–50 dishes per order; ≤ 20 choices and ≤ 30 sizes per product (app) |
| Images | JPEG/PNG/WebP by their bytes, ≤ 5 MB; links `http(s)` ≤ 2,048 |
| Chat | Message 1–1,000 (empty allowed with a photo); guest name ≤ 60; ≤ 30 photos per conversation |

## Enumerated values

| Name | Values |
| --- | --- |
| Role (`app_metadata.role`, `profiles.role`) | `customer`, `cashier`, `rider`, `admin`, `super_admin` |
| `order_channel` | `kiosk`, `pos`, `online` |
| `fulfillment_type` | `dine_in`, `take_out` (kiosk, pos); `delivery`, `pickup` (online), enforced |
| `orders.status` | `pending`, `confirmed`, `preparing`, `ready`, `out_for_delivery`, `completed`, `cancelled`, `voided` |
| `payment_method` | `cash`, `gcash` |
| `payment_status` | `unpaid`, `processing` (GCash proof awaiting verification), `paid`, `failed` (rejected), `refund_pending`, `refunded`, `refund_failed` (unused) |
| `chat_threads.kind` / `sender_role` | `support`, `delivery` / `visitor`, `customer`, `cashier`, `rider` |

## Tables

**`branches`**: `code` (UQ, fixed), `name` (UQ), `address`, `phone`, `latitude`/`longitude` (NN), `opens_at`/`closes_at`
(time, null = 24 h), `is_active` (false = closed, never deleted).

**`branch_staff`**: `profile_id` + `branch_id`. Admins have one or more rows; cashier logins and riders one; super
admins none. Read by every branch check.

**`branch_unavailable_products`**: `branch_id` + `product_id`: sold out at that branch. Readable by everyone.

**`categories`**: `name` (UQ), `sort_order`. **`products`**: `category_id`, `name` (UQ per category), `description`,
`price` (null when priced by size), `image_url`, `is_available` (false = off everywhere), `customizations` (text[]),
`sort_order`. **`product_variants`**: `product_id`, `label` (UQ per product), `price` (null = not orderable), edited in
place because order lines point at them.

**`orders`**: `branch_id`, `order_number` (set by trigger, unique per branch per Manila day), `channel`,
`fulfillment_type`, `status`, `customer_id` (online), `customer_name`, `customer_phone` (required for delivery),
`notes`, `total_amount` (always computed), `payment_method`, `payment_status`, `delivery_address` (jsonb),
`kiosk_device_id`, `rider_id`, `claimed_at`, `delivered_at`, `scheduled_for` (online; null = ASAP), `voided_at`,
`voided_by`, `void_reason`.

**`order_items`**: `order_id`, `product_id` and `variant_id` (restrict delete), `quantity` 1–99, `unit_price` (price at
ordering time), `notes`, `created_at` (stamped by the database).

**`payments`**: `order_id`, `provider` (`cash`/`gcash`), `reference_number`, `receipt_path` (private bucket, never sent to
browsers), `verified_by`/`verified_at`, `amount_centavos`, `status`, `failure_reason`, `raw` (cash: `collected_by`,
`tendered`, `change`; refunds add `refunded_by`, `refunded_at`). One paid cash payment and one `processing` GCash
submission per order at most.

**`profiles`** (one per login): `role` (kept equal to `app_metadata.role`), `full_name`, `phone`, `default_address`
(jsonb), `is_active` (false locks a rider or admin out at once).

**`kiosk_devices`**: `name`, `branch_id`, `key_hash` (SHA-256; the key is shown once), `key_prefix`, `is_active`,
`last_seen_at`.

**`employee_credentials`**: the kiosk password per branch (`role` = `kiosk`, `branch_id`, scrypt `password_hash`). The
cashier password is the branch's register account's own password.

**`order_counters`**: next number per `branch_id` + `business_date` + `channel`.

**`rate_limits`**: `key` (`<rule>:<who>`), `window_start`, `hits`. Fixed windows via `rate_limit_hit()` /
`rate_limit_count()`; old rows are purged by the server now and then.

**`site_images`**: `key` (`logo`), `image_url` (null = bundled `public/brand/logo.jpg`).

**`chat_threads`**: `kind`, `branch_id`, `order_id` (delivery only, unique), `guest_number` (from 1001, shown as
`Guest-1023`), `visitor_name`, `last_message`, `last_sender_role`, `last_message_at`, `staff_read_at`.
**`chat_thread_secrets`**: `thread_id` + `token_hash` (guest tokens). **`chat_messages`**: `thread_id`, `sender_role`,
`sender_id`, `body`, `image_path` (private bucket; browsers get a temporary `image_url`).

`delivery_address` / `default_address` shape: `{ line1, barangay?, city, landmark?, notes?, latitude?, longitude? }`.

## Storage

| Bucket | Access | Holds |
| --- | --- | --- |
| `menu-images` | Public read; super admin writes | `products/<id>/<uuid>.<ext>`, `site/logo/<uuid>.<ext>`; one-year cache (new name per upload) |
| `payment-receipts` | Private, 1-hour signed links | `<order id>/<uuid>.<ext>`; the order's customer writes, branch staff read; ≤ 10 per order |
| `chat-images` | Private, 1-hour signed links | `<thread id>/<uuid>.<ext>`; conversation members only. Not deleted with the conversation |

All buckets: 5 MB, JPEG/PNG/WebP.

## Who can read and write

| Table | Read | Write |
| --- | --- | --- |
| Menu tables, `site_images`, `branch_unavailable_products`, active `branches` | Everyone | Super admin (sold out: that branch's admins) |
| `orders`, `order_items` | Own customer; counter staff and admins of the branch; super admin; riders (their branch's ready deliveries and their own) | Customer: insert own online order (items only in that request), then cancel or send GCash proof. Branch staff: walk-ins, any change before payment. Rider: claim, return, deliver, cash. Branch, channel, customer never change |
| `payments` | Own customer; branch staff | Customer: a GCash `processing` row; staff: any; rider: cash for an order they hold |
| `profiles` | Own row; super admin | Own `full_name`, `phone`, `default_address` only (column grant) |
| `chat_threads`, `chat_messages` | Branch staff; the customer and rider of a delivery | Delivery participants post while out for delivery; staff on support threads; only staff mark read |
| `branch_staff` | Own rows | Server only |
| `kiosk_devices`, `employee_credentials`, `order_counters`, `chat_thread_secrets`, `rate_limits` | Nobody | Server only (secret key) |

**Triggers** (browser requests only): `price_order_item` (menu price, sold out, no lines added to a placed order),
`recompute_order_total`, `guard_order` (new orders pending/unpaid; only allowed moves per role), `check_online_order`
(branch active and open, valid slot, delivery details), `guard_payment` (amount from the order), `guard_chat_thread`,
`set_order_number`.

**Functions:** `auth_role()`, `has_branch_access()`, `is_active_user()`, `is_super_admin()`, `is_counter_staff()`,
`is_branch_admin()`, `is_client_request()`, `chat_partner_name()`, `order_items_total()`, `handle_new_user()`,
`next_order_number()`, `sales_report(from, to, branch_ids)` (server only), `rate_limit_hit()` / `rate_limit_count()`
(server only).

## Known gaps

- Chat photos outlive a deleted conversation (rare: only when its order is deleted).
- No idempotency key: a dropped connection plus a second tap can create two orders.
- `ready → completed` lets a cashier finish a delivery without a rider; nothing requires payment before `completed`.
- Advisor hints (harmless at this size): policies could wrap `auth.uid()` as `(select auth.uid())`; a few foreign keys
  have no index (`order_items.product_id`, `variant_id`, `orders.kiosk_device_id`, `voided_by`, `chat_messages.sender_id`,
  `employee_credentials.updated_by`, `branch_id`, `payments.verified_by`).
- The demo project still has PayMongo leftovers (`webhook_events`, three `payments` columns); see [setup.md](./setup.md#2-database).
