-- The landing page no longer shows a promo photo: its hero is the map of the
-- branches. Only the logo remains as a replaceable site image.
--
-- The stored promo file was removed first through the API
-- (DELETE /admin/site-images/promo), which deletes it from Storage too; this
-- only drops the row and narrows the allowed keys.

delete from public.site_images where key = 'promo';

alter table public.site_images drop constraint if exists site_images_key_check;
alter table public.site_images add constraint site_images_key_check check (key in ('logo'));
