-- Catalog visibility for the current frontend
--
-- The POS reads products with the Supabase anon key. The app's local admin
-- login is not a Supabase Auth session, so an `authenticated`-only SELECT
-- policy makes valid catalog rows appear empty in the browser.
-- Catalog data is intentionally public-read; keep all writes restricted to
-- the SQL editor/service role until the admin login is wired to Supabase Auth.

begin;

drop policy if exists "Authenticated users can read categories" on public.categories;
drop policy if exists "Authenticated users can read products" on public.products;
drop policy if exists "Public can read active categories" on public.categories;
drop policy if exists "Public can read active products" on public.products;

create policy "Public can read active categories"
  on public.categories for select to anon, authenticated
  using (is_active = true);

create policy "Public can read active products"
  on public.products for select to anon, authenticated
  using (is_active = true);

grant usage on schema public to anon, authenticated;
grant select on public.categories, public.products to anon, authenticated;

commit;

