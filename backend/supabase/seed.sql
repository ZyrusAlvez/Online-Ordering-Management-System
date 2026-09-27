-- Generated from supabase/seed-data/menu.json by generate-seed.mjs.
-- Do not hand-edit — change menu.json and regenerate instead.

insert into public.categories (name, sort_order) values
  ('3K Ala Carte', 1),
  ('3K Sets / Extras', 2),
  ('3K Budget Meal', 3),
  ('3K Short Order', 4),
  ('3K Specials', 5),
  ('Drinks', 6),
  ('Rice & Extras', 7),
  ('Bilao', 8)
on conflict (name) do nothing;

-- 3K Ala Carte
insert into public.products (category_id, name, sort_order) values ((select id from public.categories where name = '3K Ala Carte'), 'Lechon Kawali', 1)
on conflict (category_id, name) do nothing;

insert into public.product_variants (product_id, label, price, sort_order)
select p.id, v.label, v.price, v.sort_order
from public.products p
cross join (values
  ('250g', 145, 1),
  ('500g', 280, 2)
) as v(label, price, sort_order)
where p.category_id = (select id from public.categories where name = '3K Ala Carte') and p.name = 'Lechon Kawali'
on conflict (product_id, label) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Ala Carte'), 'Lumpiang Shanghai', 150, array[]::text[], 2
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Ala Carte'), 'Sizzling Tapa', 140, array[]::text[], 3
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Ala Carte'), 'Sizzling Sisig', 130, array[]::text[], 4
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Ala Carte'), 'Sizzling Tofu', 130, array[]::text[], 5
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Ala Carte'), 'Tokwa''t Baboy', 130, array[]::text[], 6
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Ala Carte'), 'Special Sisig', 150, array[]::text[], 7
)
on conflict (category_id, name) do nothing;

-- 3K Sets / Extras
insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Sets / Extras'), 'Set A: 5pcs Fried Chicken with Rice Platter', 300, array[]::text[], 1
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Sets / Extras'), 'Set B: Bagnet Kare-kare, Rice Platter & Iced Tea Pitcher', 350, array[]::text[], 2
)
on conflict (category_id, name) do nothing;

-- 3K Budget Meal
insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Budget Meal'), 'Bagnet w/ Rice', 70, array[]::text[], 1
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Budget Meal'), 'Tapsilog', 100, array[]::text[], 2
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Budget Meal'), 'Sisilog', 90, array[]::text[], 3
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Budget Meal'), 'Porksilog', 90, array[]::text[], 4
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Budget Meal'), 'Hotsilog', 90, array[]::text[], 5
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Budget Meal'), '2pc. Burger Steak w/ Rice', 80, array[]::text[], 6
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Budget Meal'), 'Shanghai w/ Rice', 90, array[]::text[], 7
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Budget Meal'), 'Buffalo Chicken w/ Rice', 120, array[]::text[], 8
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Budget Meal'), 'Soy Garlic Chicken w/ Rice', 120, array[]::text[], 9
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Budget Meal'), 'Special Sisig w/ Rice', 120, array[]::text[], 10
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Budget Meal'), 'Bagnet Kare-kare w/ Rice', 120, array[]::text[], 11
)
on conflict (category_id, name) do nothing;

-- 3K Short Order
insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Short Order'), 'Pancit Bihon', 130, array[]::text[], 1
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Short Order'), 'Pancit Canton', 140, array[]::text[], 2
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Short Order'), 'Canton Bihon (Mix)', 130, array[]::text[], 3
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Short Order'), 'Miki Bihon', 130, array[]::text[], 4
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Short Order'), 'Pancit Malabon (Makapal)', 130, array[]::text[], 5
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Short Order'), 'Pancit Palabok (Manipis)', 130, array[]::text[], 6
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Short Order'), 'Sotanghon Guisado', 140, array[]::text[], 7
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Short Order'), 'Bam-I (Sotanghon-Canton)', 140, array[]::text[], 8
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Short Order'), 'Lomi', 130, array[]::text[], 9
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Short Order'), 'Sopas', 130, array[]::text[], 10
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Short Order'), 'Carbonara', 120, array[]::text[], 11
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Short Order'), 'Spaghetti', 130, array[]::text[], 12
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Short Order'), 'Truffle Pasta (1-2 pax)', 150, array[]::text[], 13
)
on conflict (category_id, name) do nothing;

-- 3K Specials
insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Specials'), 'Chopseuy', 135, array[]::text[], 1
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Specials'), 'Steam Kangkong', 80, array[]::text[], 2
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Specials'), 'Chicken Curry', 220, array[]::text[], 3
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Specials'), 'Chicken Tinola', 220, array[]::text[], 4
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Specials'), 'Sinampalukang Manok', 220, array[]::text[], 5
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Specials'), 'Fried Chicken (5pcs)', 250, array[]::text[], 6
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Specials'), 'Soy Garlic Chicken Platter (5pcs)', 290, array[]::text[], 7
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Specials'), 'Buffalo Chicken Platter (5pcs)', 290, array[]::text[], 8
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Specials'), 'Binagoongang Baboy', 135, array[]::text[], 9
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Specials'), 'Sinigang na Bagnet', 250, array[]::text[], 10
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Specials'), 'Bagnet Kare-kare', 250, array[]::text[], 11
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Specials'), 'Nilagang Baka', 250, array[]::text[], 12
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = '3K Specials'), 'Beef Kare-kare', 350, array[]::text[], 13
)
on conflict (category_id, name) do nothing;

-- Drinks
insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = 'Drinks'), 'Iced Tea Pitcher', 45, array[]::text[], 1
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, sort_order) values ((select id from public.categories where name = 'Drinks'), 'Softdrinks', 2)
on conflict (category_id, name) do nothing;

insert into public.product_variants (product_id, label, price, sort_order)
select p.id, v.label, v.price, v.sort_order
from public.products p
cross join (values ('250ml', null::numeric, 1)) as v(label, price, sort_order)
where p.category_id = (select id from public.categories where name = 'Drinks') and p.name = 'Softdrinks'
on conflict (product_id, label) do nothing;

insert into public.product_variants (product_id, label, price, sort_order)
select p.id, v.label, v.price, v.sort_order
from public.products p
cross join (values ('750ml', null::numeric, 2)) as v(label, price, sort_order)
where p.category_id = (select id from public.categories where name = 'Drinks') and p.name = 'Softdrinks'
on conflict (product_id, label) do nothing;

insert into public.product_variants (product_id, label, price, sort_order)
select p.id, v.label, v.price, v.sort_order
from public.products p
cross join (values ('1.25L', null::numeric, 3)) as v(label, price, sort_order)
where p.category_id = (select id from public.categories where name = 'Drinks') and p.name = 'Softdrinks'
on conflict (product_id, label) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = 'Drinks'), 'Leche Flan', 85, array[]::text[], 3
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = 'Drinks'), 'Mais Con Yelo', 45, array[]::text[], 4
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = 'Drinks'), 'Halo-halo', 55, array[]::text[], 5
)
on conflict (category_id, name) do nothing;

-- Rice & Extras
insert into public.products (category_id, name, sort_order) values ((select id from public.categories where name = 'Rice & Extras'), 'Plain Rice', 1)
on conflict (category_id, name) do nothing;

insert into public.product_variants (product_id, label, price, sort_order)
select p.id, v.label, v.price, v.sort_order
from public.products p
cross join (values
  ('Single', 15, 1),
  ('Platter', 70, 2)
) as v(label, price, sort_order)
where p.category_id = (select id from public.categories where name = 'Rice & Extras') and p.name = 'Plain Rice'
on conflict (product_id, label) do nothing;

insert into public.products (category_id, name, sort_order) values ((select id from public.categories where name = 'Rice & Extras'), 'Fried Rice', 2)
on conflict (category_id, name) do nothing;

insert into public.product_variants (product_id, label, price, sort_order)
select p.id, v.label, v.price, v.sort_order
from public.products p
cross join (values
  ('Single', 20, 1),
  ('Platter', 100, 2)
) as v(label, price, sort_order)
where p.category_id = (select id from public.categories where name = 'Rice & Extras') and p.name = 'Fried Rice'
on conflict (product_id, label) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = 'Rice & Extras'), 'Egg', 20, array['Fried', 'Boiled'], 3
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = 'Rice & Extras'), 'Extra Sauce', 10, array[]::text[], 4
)
on conflict (category_id, name) do nothing;

insert into public.products (category_id, name, price, customizations, sort_order) values (
  (select id from public.categories where name = 'Rice & Extras'), 'Tupperware', 25, array[]::text[], 5
)
on conflict (category_id, name) do nothing;

-- Bilao
insert into public.products (category_id, name, sort_order) values ((select id from public.categories where name = 'Bilao'), 'Bihon Bilao', 1)
on conflict (category_id, name) do nothing;

insert into public.product_variants (product_id, label, price, sort_order)
select p.id, v.label, v.price, v.sort_order
from public.products p
cross join (values
  ('XMINI', 300, 1),
  ('MINI', 450, 2),
  ('SMALL', 600, 3),
  ('MEDIUM', 700, 4),
  ('LARGE', 900, 5)
) as v(label, price, sort_order)
where p.category_id = (select id from public.categories where name = 'Bilao') and p.name = 'Bihon Bilao'
on conflict (product_id, label) do nothing;

insert into public.products (category_id, name, sort_order) values ((select id from public.categories where name = 'Bilao'), 'Canton Bihon Bilao', 2)
on conflict (category_id, name) do nothing;

insert into public.product_variants (product_id, label, price, sort_order)
select p.id, v.label, v.price, v.sort_order
from public.products p
cross join (values
  ('XMINI', 300, 1),
  ('MINI', 450, 2),
  ('SMALL', 600, 3),
  ('MEDIUM', 700, 4),
  ('LARGE', 900, 5)
) as v(label, price, sort_order)
where p.category_id = (select id from public.categories where name = 'Bilao') and p.name = 'Canton Bihon Bilao'
on conflict (product_id, label) do nothing;

insert into public.products (category_id, name, sort_order) values ((select id from public.categories where name = 'Bilao'), 'Miki Bihon Bilao', 3)
on conflict (category_id, name) do nothing;

insert into public.product_variants (product_id, label, price, sort_order)
select p.id, v.label, v.price, v.sort_order
from public.products p
cross join (values
  ('XMINI', 300, 1),
  ('MINI', 450, 2),
  ('SMALL', 600, 3),
  ('MEDIUM', 700, 4),
  ('LARGE', 900, 5)
) as v(label, price, sort_order)
where p.category_id = (select id from public.categories where name = 'Bilao') and p.name = 'Miki Bihon Bilao'
on conflict (product_id, label) do nothing;

insert into public.products (category_id, name, sort_order) values ((select id from public.categories where name = 'Bilao'), 'Canton Bilao', 4)
on conflict (category_id, name) do nothing;

insert into public.product_variants (product_id, label, price, sort_order)
select p.id, v.label, v.price, v.sort_order
from public.products p
cross join (values
  ('XMINI', 350, 1),
  ('MINI', 500, 2),
  ('SMALL', 700, 3),
  ('MEDIUM', 850, 4),
  ('LARGE', 1050, 5)
) as v(label, price, sort_order)
where p.category_id = (select id from public.categories where name = 'Bilao') and p.name = 'Canton Bilao'
on conflict (product_id, label) do nothing;

insert into public.products (category_id, name, sort_order) values ((select id from public.categories where name = 'Bilao'), 'Sotanghon Bilao', 5)
on conflict (category_id, name) do nothing;

insert into public.product_variants (product_id, label, price, sort_order)
select p.id, v.label, v.price, v.sort_order
from public.products p
cross join (values
  ('XMINI', 350, 1),
  ('MINI', 500, 2),
  ('SMALL', 700, 3),
  ('MEDIUM', 850, 4),
  ('LARGE', 1050, 5)
) as v(label, price, sort_order)
where p.category_id = (select id from public.categories where name = 'Bilao') and p.name = 'Sotanghon Bilao'
on conflict (product_id, label) do nothing;

insert into public.products (category_id, name, sort_order) values ((select id from public.categories where name = 'Bilao'), 'Bam-I Bilao', 6)
on conflict (category_id, name) do nothing;

insert into public.product_variants (product_id, label, price, sort_order)
select p.id, v.label, v.price, v.sort_order
from public.products p
cross join (values
  ('XMINI', 350, 1),
  ('MINI', 500, 2),
  ('SMALL', 700, 3),
  ('MEDIUM', 850, 4),
  ('LARGE', 1050, 5)
) as v(label, price, sort_order)
where p.category_id = (select id from public.categories where name = 'Bilao') and p.name = 'Bam-I Bilao'
on conflict (product_id, label) do nothing;

insert into public.products (category_id, name, sort_order) values ((select id from public.categories where name = 'Bilao'), 'Spaghetti Bilao', 7)
on conflict (category_id, name) do nothing;

insert into public.product_variants (product_id, label, price, sort_order)
select p.id, v.label, v.price, v.sort_order
from public.products p
cross join (values
  ('XMINI', 350, 1),
  ('MINI', 500, 2),
  ('SMALL', 700, 3),
  ('MEDIUM', 850, 4),
  ('LARGE', 1050, 5)
) as v(label, price, sort_order)
where p.category_id = (select id from public.categories where name = 'Bilao') and p.name = 'Spaghetti Bilao'
on conflict (product_id, label) do nothing;

insert into public.products (category_id, name, sort_order) values ((select id from public.categories where name = 'Bilao'), 'Carbonara Bilao', 8)
on conflict (category_id, name) do nothing;

insert into public.product_variants (product_id, label, price, sort_order)
select p.id, v.label, v.price, v.sort_order
from public.products p
cross join (values
  ('XMINI', 350, 1),
  ('MINI', 500, 2),
  ('SMALL', 700, 3),
  ('MEDIUM', 850, 4),
  ('LARGE', 1050, 5)
) as v(label, price, sort_order)
where p.category_id = (select id from public.categories where name = 'Bilao') and p.name = 'Carbonara Bilao'
on conflict (product_id, label) do nothing;

insert into public.products (category_id, name, sort_order) values ((select id from public.categories where name = 'Bilao'), 'Palabok Bilao', 9)
on conflict (category_id, name) do nothing;

insert into public.product_variants (product_id, label, price, sort_order)
select p.id, v.label, v.price, v.sort_order
from public.products p
cross join (values
  ('XMINI', 350, 1),
  ('MINI', 500, 2),
  ('SMALL', 700, 3),
  ('MEDIUM', 850, 4),
  ('LARGE', 1050, 5)
) as v(label, price, sort_order)
where p.category_id = (select id from public.categories where name = 'Bilao') and p.name = 'Palabok Bilao'
on conflict (product_id, label) do nothing;

insert into public.products (category_id, name, sort_order) values ((select id from public.categories where name = 'Bilao'), 'Pancit Malabon Bilao', 10)
on conflict (category_id, name) do nothing;

insert into public.product_variants (product_id, label, price, sort_order)
select p.id, v.label, v.price, v.sort_order
from public.products p
cross join (values
  ('XMINI', 350, 1),
  ('MINI', 500, 2),
  ('SMALL', 700, 3),
  ('MEDIUM', 850, 4),
  ('LARGE', 1050, 5)
) as v(label, price, sort_order)
where p.category_id = (select id from public.categories where name = 'Bilao') and p.name = 'Pancit Malabon Bilao'
on conflict (product_id, label) do nothing;

