-- The shop currently authenticates through its built-in password gate.
-- Allow the authenticated browser session to use the public anon key for the
-- catalog and billing RPC. Run only for this intentionally single-store setup.

begin;

drop policy if exists "Authenticated users can manage categories" on public.categories;
drop policy if exists "Authenticated users can manage products" on public.products;

create policy "Shop password users can manage categories"
  on public.categories for all to anon, authenticated
  using (true) with check (true);

create policy "Shop password users can manage products"
  on public.products for all to anon, authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.categories, public.products to anon;
grant execute on function public.create_order_with_stock(text,text,numeric,text,numeric,numeric,jsonb,numeric,text,numeric,text,text,text,numeric,text) to anon;

commit;
