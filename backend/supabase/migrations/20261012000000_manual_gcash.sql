-- Manual GCash, replacing PayMongo.
--
-- The customer pays our GCash account from their own phone, then proves it with a
-- reference number and/or a receipt screenshot. Staff check their GCash app and
-- approve or reject it. A payment row is one such submission (or one cash/counter
-- settlement), so a rejected-then-resubmitted payment keeps its history.
--
--   orders.payment_status: unpaid -> processing (awaiting verification) -> paid
--                                                                       -> failed (rejected; resubmit)
--   void of a paid GCash order:      paid -> refund_pending -> refunded   (refund sent by hand)

-- ---------------------------------------------------------------------------
-- payments: what the customer submitted and who checked it
-- ---------------------------------------------------------------------------
alter table public.payments
  add column if not exists reference_number text,
  add column if not exists receipt_path     text,
  add column if not exists verified_by      uuid references auth.users (id) on delete set null,
  add column if not exists verified_at      timestamptz;

alter table public.payments drop constraint if exists payments_reference_number_check;
alter table public.payments
  add constraint payments_reference_number_check
  check (reference_number is null or reference_number ~ '^[A-Za-z0-9 ]{6,40}$');

-- Where the receipt lives in the payment-receipts bucket: <order id>/<uuid>.<ext>.
alter table public.payments drop constraint if exists payments_receipt_path_check;
alter table public.payments
  add constraint payments_receipt_path_check
  check (receipt_path is null or (char_length(receipt_path) <= 200 and receipt_path !~ '\.\.'));

alter table public.payments alter column provider set default 'cash';
update public.payments set provider = 'gcash' where provider = 'paymongo';

alter table public.payments drop constraint if exists payments_provider_check;
alter table public.payments
  add constraint payments_provider_check check (provider in ('cash', 'gcash'));

-- At most one submission waiting on staff per order, so a double-tap cannot queue two.
create unique index if not exists payments_one_open_gcash_per_order
  on public.payments (order_id) where provider = 'gcash' and status = 'processing';

-- A refund is now sent by hand; there is no provider to fail it.
update public.payments set status = 'refund_pending' where status = 'refund_failed';
update public.orders   set payment_status = 'refund_pending' where payment_status = 'refund_failed';

-- ---------------------------------------------------------------------------
-- Receipt screenshots: personal (names, numbers), so a PRIVATE bucket. The API
-- uploads with the secret key and hands out short-lived signed links.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-receipts', 'payment-receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
