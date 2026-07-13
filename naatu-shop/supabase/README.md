# Supabase catalog seed

Run `0001_catalog_schema.sql` first in the Supabase SQL Editor for the project
configured in `naatu-shop/.env`. It creates the `public.categories` and
`public.products` tables required by the application. Then run
`0002_catalog_read_policy.sql` to make active catalog rows visible to the POS,
then run `0003_catalog_admin_write_policy.sql` to enable catalog writes. Finally
run `seed_catalog.sql` to load the catalog.

Run `0005_catalog_stock_compatibility.sql` once to backfill stock created by older
versions of the catalog form, then run `0006_billing_and_authenticated_catalog_fix.sql`.
The latter removes the separate admin-role requirement: any authenticated user can
manage the catalog, while unauthenticated users still cannot write.
The seed must be run in the Supabase SQL Editor (not from the browser).

The script is idempotent:

- creates `Tailoring`, `Jewellery & Accessories`, and `Posstore` when missing;
- inserts the 21 requested products only when the same name/category pair is missing;
- activates the matching categories and products;
- links products to `categories.id` through `products.category_id`;
- uses `0` for price and stock because those values were not supplied.

After execution, update prices, stock, SKU/barcode, GST, and images from the
Products screen before taking sales. The final query in the SQL file reports
the seeded product count by category and should return 13, 5, and 3.

Do not put `SUPABASE_SERVICE_ROLE_KEY` in frontend code or expose it through
Vite environment variables. Run the seed with the Supabase SQL Editor or a
server-side deployment job.

After catalog setup, run `0004_billing_backend.sql`. It creates the orders,
order_items, coupons, and product_variants tables plus the atomic
`create_order_with_stock` RPC used by Complete Sale, Order History, stock, and
Analytics.
