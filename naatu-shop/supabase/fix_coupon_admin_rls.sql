-- Coupons are managed inside the local-password store app.
-- There is no Supabase profile/admin requirement for this single-store setup.
-- Run this once in the Supabase SQL Editor.

begin;

alter table public.coupons enable row level security;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'coupons'
  loop
    execute format('drop policy if exists %I on public.coupons', policy_row.policyname);
  end loop;
end
$$;

create policy "Shop users can manage coupons"
  on public.coupons
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.coupons to anon, authenticated;

notify pgrst, 'reload schema';
commit;
