-- Purple Boutique catalog seed
-- Run in Supabase SQL Editor with a role allowed to write public.categories
-- and public.products. This script is safe to run more than once.
--
-- Prices and stock are intentionally 0 because the catalog request did not
-- include commercial values. Update them in Products after this seed runs.

begin;

with category_seed(name_en, name_ta, sort_order) as (
  values
    ('Tailoring', 'Tailoring', 10),
    ('Jewellery & Accessories', 'Jewellery & Accessories', 20),
    ('Posstore', 'Posstore', 30)
)
insert into public.categories (name_en, name_ta, sort_order, is_active)
select s.name_en, s.name_ta, s.sort_order, true
from category_seed s
where not exists (
  select 1
  from public.categories c
  where lower(trim(c.name_en)) = lower(trim(s.name_en))
);

-- Make sure matching categories are available to the POS after a rerun.
update public.categories c
set is_active = true
where lower(trim(c.name_en)) in (
  'tailoring',
  'jewellery & accessories',
  'posstore'
);

with product_seed(category_name, product_name, sort_order) as (
  values
    ('Tailoring', 'Saree blouse', 10),
    ('Tailoring', 'Saree blouse + cup', 20),
    ('Tailoring', 'Readymade saree', 30),
    ('Tailoring', 'Punjabi suit', 40),
    ('Tailoring', 'Punjabi suit + salwar', 50),
    ('Tailoring', 'Baju kurung', 60),
    ('Tailoring', 'Baju kebaya', 70),
    ('Tailoring', 'Baju Melaya', 80),
    ('Tailoring', 'Lehelga', 90),
    ('Tailoring', 'Alterations', 100),
    ('Tailoring', 'Pavadai sattai', 110),
    ('Tailoring', 'Designs', 120),
    ('Tailoring', 'Add-ons', 130),
    ('Jewellery & Accessories', 'Earrings', 10),
    ('Jewellery & Accessories', 'Bridal jewellery Rent', 20),
    ('Jewellery & Accessories', 'Choker set', 30),
    ('Jewellery & Accessories', 'Anklet', 40),
    ('Jewellery & Accessories', 'Add-ons', 50),
    ('Posstore', 'Claim parcel', 10),
    ('Posstore', 'Perfume', 20),
    ('Posstore', 'Add-ons', 30)
), resolved as (
  select
    c.id as category_id,
    c.name_en as category_name,
    p.product_name,
    p.sort_order
  from product_seed p
  join public.categories c
    on lower(trim(c.name_en)) = lower(trim(p.category_name))
)
insert into public.products (
  name,
  name_ta,
  tamil_name,
  category,
  category_id,
  price,
  offer_price,
  stock_quantity,
  stock,
  unit_type,
  unit_label,
  base_quantity,
  allow_decimal_quantity,
  predefined_options,
  is_active,
  sort_order,
  has_variants
)
select
  r.product_name,
  r.product_name,
  r.product_name,
  r.category_name,
  r.category_id,
  0,
  null,
  0,
  0,
  'unit',
  'pc',
  1,
  false,
  '[]'::jsonb,
  true,
  r.sort_order,
  false
from resolved r
where not exists (
  select 1
  from public.products existing
  where lower(trim(existing.name)) = lower(trim(r.product_name))
    and lower(trim(coalesce(existing.category, ''))) = lower(trim(r.category_name))
);

-- Repair links for matching rows created by an older version of this seed.
with product_seed(category_name, product_name) as (
  values
    ('Tailoring', 'Saree blouse'), ('Tailoring', 'Saree blouse + cup'),
    ('Tailoring', 'Readymade saree'), ('Tailoring', 'Punjabi suit'),
    ('Tailoring', 'Punjabi suit + salwar'), ('Tailoring', 'Baju kurung'),
    ('Tailoring', 'Baju kebaya'), ('Tailoring', 'Baju Melaya'),
    ('Tailoring', 'Lehelga'), ('Tailoring', 'Alterations'),
    ('Tailoring', 'Pavadai sattai'), ('Tailoring', 'Designs'),
    ('Tailoring', 'Add-ons'), ('Jewellery & Accessories', 'Earrings'),
    ('Jewellery & Accessories', 'Bridal jewellery Rent'),
    ('Jewellery & Accessories', 'Choker set'), ('Jewellery & Accessories', 'Anklet'),
    ('Jewellery & Accessories', 'Add-ons'), ('Posstore', 'Claim parcel'),
    ('Posstore', 'Perfume'), ('Posstore', 'Add-ons')
)
update public.products p
set category_id = c.id,
    is_active = true
from product_seed s
join public.categories c
  on lower(trim(c.name_en)) = lower(trim(s.category_name))
where lower(trim(p.name)) = lower(trim(s.product_name))
  and lower(trim(coalesce(p.category, ''))) = lower(trim(s.category_name));

commit;

-- Verification: should return 3 categories and 21 products.
select c.name_en as category, count(p.id) as product_count
from public.categories c
left join public.products p on p.category_id = c.id
where lower(trim(c.name_en)) in ('tailoring', 'jewellery & accessories', 'posstore')
group by c.id, c.name_en, c.sort_order
order by c.sort_order;
