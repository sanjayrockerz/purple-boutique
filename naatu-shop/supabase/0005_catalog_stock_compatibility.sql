-- Backfill inventory created by older catalog forms.
-- Run once in the Supabase SQL editor after the catalog migrations.

begin;

update public.products
set stock_quantity = stock
where coalesce(stock_quantity, 0) = 0
  and coalesce(stock, 0) > 0;

commit;
