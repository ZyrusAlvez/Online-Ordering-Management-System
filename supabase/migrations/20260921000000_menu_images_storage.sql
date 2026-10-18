-- Image storage for the admin-editable menu and branding.
--
-- The bucket is public so <img src> works for customers and kiosks without a
-- signed URL. No storage.objects policies are created, so browsers cannot write
-- or list anything: uploads and deletes go through the API with the secret key.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Brand images shown across the site (header logo, landing promo, kiosk splash).
-- A null image_url means "use the bundled default".
create table if not exists public.site_images (
  key        text primary key check (key in ('logo', 'promo')),
  image_url  text,
  updated_at timestamptz not null default now()
);

alter table public.site_images enable row level security;

create policy site_images_read on public.site_images
  for select to anon, authenticated using (true);

insert into public.site_images (key) values ('logo'), ('promo')
on conflict (key) do nothing;
