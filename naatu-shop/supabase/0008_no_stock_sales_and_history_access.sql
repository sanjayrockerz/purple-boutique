-- This store does not maintain inventory counts. Sales must never be blocked by stock.
-- The app uses a local password gate, so the anon key also needs history read access.

begin;

create or replace function public.create_order_without_stock(
  p_address text, p_coupon_code text, p_coupon_percentage numeric, p_customer_name text,
  p_delivery_charge numeric, p_discount_amount numeric, p_items jsonb, p_manual_discount_amount numeric,
  p_manual_discount_type text, p_manual_discount_value numeric, p_order_mode text, p_order_type text,
  p_phone text, p_shipping numeric, p_status text
)
returns table(order_id uuid, invoice_no text, created_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare
  v_order_id uuid := gen_random_uuid(); v_invoice_no text; v_now timestamptz := now();
  v_subtotal numeric(12,2) := 0; v_total numeric(12,2);
  v_delivery numeric(12,2) := greatest(coalesce(p_delivery_charge,0),0);
  v_discount numeric(12,2) := greatest(coalesce(p_discount_amount,0),0);
  v_manual numeric(12,2) := greatest(coalesce(p_manual_discount_amount,0),0);
  v_item jsonb; v_qty numeric(12,3); v_price numeric(12,2); v_line numeric(12,2); v_source text;
begin
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then
    raise exception 'At least one item is required';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := greatest(coalesce(nullif(v_item->>'quantity','')::numeric,0),0);
    v_price := greatest(coalesce(nullif(v_item->>'base_price','')::numeric,0),0);
    v_line := greatest(coalesce(nullif(v_item->>'line_total','')::numeric,v_qty*v_price),0);
    if v_qty <= 0 then raise exception 'Item quantity must be greater than zero'; end if;
    v_subtotal := v_subtotal + v_line;
  end loop;

  v_total := greatest(round(v_subtotal-v_discount-v_manual+v_delivery,2),0);
  v_invoice_no := 'PB-' || to_char(v_now,'YYYYMMDD') || '-' || lpad(nextval('public.invoice_number_seq')::text,6,'0');
  insert into public.orders(id,invoice_no,customer_name,phone,address,items,subtotal,total,status,order_mode,order_type,shipping,delivery_charge,discount_amount,manual_discount_amount,manual_discount_type,manual_discount_value,coupon_code,coupon_percentage,created_at,updated_at)
  values(v_order_id,v_invoice_no,coalesce(nullif(trim(p_customer_name),''),'Walk-in Customer'),coalesce(trim(p_phone),''),coalesce(nullif(trim(p_address),''),'POS Counter'),p_items,v_subtotal,v_total,coalesce(p_status,'completed'),coalesce(p_order_mode,'offline'),coalesce(p_order_type,'pos_sale'),v_delivery,v_delivery,v_discount,v_manual,coalesce(p_manual_discount_type,'flat'),greatest(coalesce(p_manual_discount_value,0),0),nullif(trim(coalesce(p_coupon_code,'')),''),greatest(coalesce(p_coupon_percentage,0),0),v_now,v_now);

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := greatest(coalesce(nullif(v_item->>'quantity','')::numeric,0),0);
    v_price := greatest(coalesce(nullif(v_item->>'base_price','')::numeric,0),0);
    v_line := greatest(coalesce(nullif(v_item->>'line_total','')::numeric,v_qty*v_price),0);
    v_source := coalesce(nullif(v_item->>'source',''),'catalogue');
    insert into public.order_items(order_id,product_id,variant_id,product_name,tamil_name,variant_name,quantity,unit,unit_price,line_total,is_manual,source,note)
    values(v_order_id,nullif(v_item->>'product_id',''),nullif(v_item->>'variant_id',''),coalesce(nullif(v_item->>'name',''),'Product'),nullif(v_item->>'tamil_name',''),nullif(v_item->>'variant_name',''),v_qty,coalesce(nullif(v_item->>'unit',''),'pc'),v_price,v_line,v_source='manual',v_source,nullif(v_item->>'note',''));
  end loop;

  if p_coupon_code is not null and trim(p_coupon_code)<>'' then
    update public.coupons set usage_count=usage_count+1 where upper(code)=upper(trim(p_coupon_code));
  end if;
  return query select v_order_id,v_invoice_no,v_now;
end;
$$;

grant execute on function public.create_order_without_stock(text,text,numeric,text,numeric,numeric,jsonb,numeric,text,numeric,text,text,text,numeric,text) to anon, authenticated;

drop policy if exists "Authenticated users can read orders" on public.orders;
drop policy if exists "Authenticated users can read order items" on public.order_items;
drop policy if exists "Authenticated users can read coupons" on public.coupons;
drop policy if exists "Shop users can read orders" on public.orders;
drop policy if exists "Shop users can read order items" on public.order_items;
drop policy if exists "Shop users can read coupons" on public.coupons;
create policy "Shop users can read orders" on public.orders for select to anon, authenticated using (true);
create policy "Shop users can read order items" on public.order_items for select to anon, authenticated using (true);
create policy "Shop users can read coupons" on public.coupons for select to anon, authenticated using (true);
grant select on public.orders, public.order_items, public.coupons to anon;

commit;
