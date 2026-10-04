-- Photos in chat (guest <-> cashier, customer <-> rider).
--
-- Chat photos are personal (a customer's door, a receipt, a damaged order), so unlike
-- the public menu-images bucket this one is PRIVATE: nothing in it has a public address.
-- The API uploads with the secret key and hands out short-lived signed links, only to
-- people who can already read that conversation.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Where the photo lives in the bucket: <thread id>/<uuid>.<ext>. Null for text messages.
alter table public.chat_messages add column if not exists image_path text;

-- A message is text, a photo, or both. Text still has to be 1 to 1000 characters
-- unless it is a photo, whose text may be empty.
alter table public.chat_messages drop constraint if exists chat_messages_body_check;
alter table public.chat_messages
  add constraint chat_messages_body_check check (
    char_length(body) <= 1000
    and (image_path is not null or char_length(btrim(body)) >= 1)
  );

alter table public.chat_messages drop constraint if exists chat_messages_image_path_check;
alter table public.chat_messages
  add constraint chat_messages_image_path_check
  check (image_path is null or (char_length(image_path) <= 200 and image_path !~ '\.\.'));
