-- PayMongo is gone: drop its identifiers and the webhook de-duplication table.
alter table public.payments
  drop column if exists intent_id,
  drop column if exists payment_id,
  drop column if exists refund_id;

drop table if exists public.webhook_events;
