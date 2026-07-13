-- Fix stock checks for legacy products and product variants.
-- Catalog writes require authentication, but no separate profile admin role.

begin;

-- Bring older stock edits into the inventory column used by billing.
update public.products
set stock_quantity = stock
where coalesce(stock_quantity, 0) = 0
  and coalesce(stock, 0) > 0;

drop policy if exists "Admins can manage categories" on public.categories;
drop policy if exists "Admins can manage products" on public.products;
drop policy if exists "Authenticated users can manage categories" on public.categories;
drop policy if exists "Authenticated users can manage products" on public.products;

create policy "Authenticated users can manage categories"
  on public.categories for all to authenticated
  using (true) with check (true);

create policy "Authenticated users can manage products"
  on public.products for all to authenticated
  using (true) with check (true);

create or replace function public.create_order_with_stock(
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
  v_item jsonb; v_qty numeric(12,3); v_price numeric(12,2); v_line numeric(12,2);
  v_product_id bigint; v_stock numeric(12,3); v_source text; v_variant_id uuid;
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
    v_product_id := case when coalesce(v_item->>'product_id','') ~ '^[0-9]+$' then (v_item->>'product_id')::bigint else null end;
    v_variant_id := case when coalesce(v_item->>'variant_id','') ~* '^[0-9a-f-]{36}$' then (v_item->>'variant_id')::uuid else null end;

    if v_source <> 'manual' then
      if v_variant_id is not null then
        select stock into v_stock from public.product_variants where id = v_variant_id and is_active = true for update;
        if v_stock is null then raise exception 'Variant % was not found',v_variant_id; end if;
        if v_stock < v_qty then raise exception 'Insufficient stock for %',coalesce(v_item->>'name','product'); end if;
        update public.product_variants set stock = stock - v_qty, updated_at = now() where id = v_variant_id;
      elsif v_product_id is not null then
        select greatest(coalesce(stock_quantity,0),coalesce(stock,0)) into v_stock from public.products where id = v_product_id for update;
        if v_stock is null then raise exception 'Product % was not found',v_product_id; end if;
        if v_stock < v_qty then raise exception 'Insufficient stock for %',coalesce(v_item->>'name','product'); end if;
        update public.products set stock_quantity = v_stock-v_qty, stock = greatest(0,floor(v_stock-v_qty)::integer), updated_at = now() where id = v_product_id;
      end if;
    end if;

    insert into public.order_items(order_id,product_id,variant_id,product_name,tamil_name,variant_name,quantity,unit,unit_price,line_total,is_manual,source,note)
    values(v_order_id,nullif(v_item->>'product_id',''),nullif(v_item->>'variant_id',''),coalesce(nullif(v_item->>'name',''),'Product'),nullif(v_item->>'tamil_name',''),nullif(v_item->>'variant_name',''),v_qty,coalesce(nullif(v_item->>'unit',''),'pc'),v_price,v_line,v_source='manual',v_source,nullif(v_item->>'note',''));
  end loop;

  if p_coupon_code is not null and trim(p_coupon_code)<>'' then
    update public.coupons set usage_count=usage_count+1 where upper(code)=upper(trim(p_coupon_code));
  end if;
  return query select v_order_id,v_invoice_no,v_now;
end;
$$;

revoke all on function public.create_order_with_stock(text,text,numeric,text,numeric,numeric,jsonb,numeric,text,numeric,text,text,text,numeric,text) from public;
grant execute on function public.create_order_with_stock(text,text,numeric,text,numeric,numeric,jsonb,numeric,text,numeric,text,text,text,numeric,text) to authenticated;

notify pgrst, 'reload schema';
commit;
