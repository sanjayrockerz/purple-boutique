-- Purple Boutique initial catalog. Existing matching products are preserved.

INSERT INTO public.categories (name_en, name_ta, is_active, sort_order)
VALUES
  ('Tailoring', '', TRUE, 1),
  ('Jewellery & Accessories', '', TRUE, 2),
  ('Posstore', '', TRUE, 3)
ON CONFLICT (name_en) DO UPDATE SET
  is_active = TRUE,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

WITH catalog(category_name, product_name, sort_order) AS (
  VALUES
    ('Tailoring', 'Saree Blouse', 101),
    ('Tailoring', 'Saree Blouse + Cup', 102),
    ('Tailoring', 'Readymade Saree', 103),
    ('Tailoring', 'Punjabi Suit', 104),
    ('Tailoring', 'Punjabi Suit + Salwar', 105),
    ('Tailoring', 'Baju Kurung', 106),
    ('Tailoring', 'Baju Kebaya', 107),
    ('Tailoring', 'Baju Melaya', 108),
    ('Tailoring', 'Lehelga', 109),
    ('Tailoring', 'Alterations', 110),
    ('Tailoring', 'Pavadai Sattai', 111),
    ('Tailoring', 'Designs', 112),
    ('Tailoring', 'Add-ons', 113),
    ('Jewellery & Accessories', 'Earrings', 201),
    ('Jewellery & Accessories', 'Bridal Jewellery Rent', 202),
    ('Jewellery & Accessories', 'Choker Set', 203),
    ('Jewellery & Accessories', 'Anklet', 204),
    ('Jewellery & Accessories', 'Add-ons', 205),
    ('Posstore', 'Claim Parcel', 301),
    ('Posstore', 'Perfume', 302),
    ('Posstore', 'Add-ons', 303)
), resolved AS (
  SELECT c.id AS category_id, c.name_en AS category_name, catalog.product_name, catalog.sort_order
  FROM catalog
  JOIN public.categories c ON LOWER(c.name_en) = LOWER(catalog.category_name)
)
INSERT INTO public.products (
  name, category, category_id, price, purchase_price, mrp, unit_type, unit_label,
  unit, base_quantity, stock_quantity, opening_stock, stock, stock_unit,
  allow_decimal_quantity, predefined_options, description, is_active, sort_order
)
SELECT
  resolved.product_name,
  resolved.category_name,
  resolved.category_id,
  0,
  0,
  0,
  'unit',
  'piece',
  'piece',
  1,
  999,
  999,
  999,
  'piece',
  FALSE,
  '[]'::JSONB,
  resolved.product_name || ' service or product',
  TRUE,
  resolved.sort_order
FROM resolved
WHERE NOT EXISTS (
  SELECT 1
  FROM public.products p
  WHERE p.category_id = resolved.category_id
    AND LOWER(BTRIM(p.name)) = LOWER(BTRIM(resolved.product_name))
);

UPDATE public.products p
SET is_active = TRUE,
    category = c.name_en,
    updated_at = NOW()
FROM public.categories c
WHERE p.category_id = c.id
  AND c.name_en IN ('Tailoring', 'Jewellery & Accessories', 'Posstore');

WITH catalog(category_name, product_name, sort_order) AS (
  VALUES
    ('Tailoring', 'Saree Blouse', 101),
    ('Tailoring', 'Saree Blouse + Cup', 102),
    ('Tailoring', 'Readymade Saree', 103),
    ('Tailoring', 'Punjabi Suit', 104),
    ('Tailoring', 'Punjabi Suit + Salwar', 105),
    ('Tailoring', 'Baju Kurung', 106),
    ('Tailoring', 'Baju Kebaya', 107),
    ('Tailoring', 'Baju Melaya', 108),
    ('Tailoring', 'Lehelga', 109),
    ('Tailoring', 'Alterations', 110),
    ('Tailoring', 'Pavadai Sattai', 111),
    ('Tailoring', 'Designs', 112),
    ('Tailoring', 'Add-ons', 113),
    ('Jewellery & Accessories', 'Earrings', 201),
    ('Jewellery & Accessories', 'Bridal Jewellery Rent', 202),
    ('Jewellery & Accessories', 'Choker Set', 203),
    ('Jewellery & Accessories', 'Anklet', 204),
    ('Jewellery & Accessories', 'Add-ons', 205),
    ('Posstore', 'Claim Parcel', 301),
    ('Posstore', 'Perfume', 302),
    ('Posstore', 'Add-ons', 303)
)
UPDATE public.products p
SET name = catalog.product_name,
    sort_order = catalog.sort_order,
    updated_at = NOW()
FROM catalog
JOIN public.categories c ON LOWER(c.name_en) = LOWER(catalog.category_name)
WHERE p.category_id = c.id
  AND LOWER(BTRIM(p.name)) = LOWER(BTRIM(catalog.product_name));
