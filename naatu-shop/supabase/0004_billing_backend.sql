-- Complete billing backend for Purple Boutique.
-- Run in Supabase SQL Editor after the catalog migrations.

begin;
create extension if not exists pgcrypto;
create sequence if not exists public.invoice_number_seq;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(), invoice_no text not null unique,
  customer_name text not null default 'Walk-in Customer', phone text not null default '', address text not null default '',
  user_id uuid references auth.users(id) on delete set null, items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0, total numeric(12,2) not null default 0,
  status text not null default 'completed', order_mode text not null default 'offline', order_type text not null default 'pos_sale',
  shipping numeric(12,2) not null default 0, delivery_charge numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0, manual_discount_amount numeric(12,2) not null default 0,
  manual_discount_type text not null default 'flat', manual_discount_value numeric(12,2) not null default 0,
  coupon_code text, coupon_percentage numeric(5,2) not null default 0, gst_amount numeric(12,2) not null default 0,
  total_gst numeric(12,2) not null default 0, payment_mode text, payment_method text, invoice_pdf_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists invoice_no text;
alter table public.orders add column if not exists customer_name text default 'Walk-in Customer';
alter table public.orders add column if not exists phone text default '';
alter table public.orders add column if not exists address text default '';
alter table public.orders add column if not exists user_id uuid;
alter table public.orders add column if not exists items jsonb default '[]'::jsonb;
alter table public.orders add column if not exists subtotal numeric(12,2) default 0;
alter table public.orders add column if not exists total numeric(12,2) default 0;
alter table public.orders add column if not exists status text default 'completed';
alter table public.orders add column if not exists order_mode text default 'offline';
alter table public.orders add column if not exists order_type text default 'pos_sale';
alter table public.orders add column if not exists shipping numeric(12,2) default 0;
alter table public.orders add column if not exists delivery_charge numeric(12,2) default 0;
alter table public.orders add column if not exists discount_amount numeric(12,2) default 0;
alter table public.orders add column if not exists manual_discount_amount numeric(12,2) default 0;
alter table public.orders add column if not exists manual_discount_type text default 'flat';
alter table public.orders add column if not exists manual_discount_value numeric(12,2) default 0;
alter table public.orders add column if not exists coupon_code text;
alter table public.orders add column if not exists coupon_percentage numeric(5,2) default 0;
alter table public.orders add column if not exists gst_amount numeric(12,2) default 0;
alter table public.orders add column if not exists total_gst numeric(12,2) default 0;
alter table public.orders add column if not exists payment_mode text;
alter table public.orders add column if not exists payment_method text;
alter table public.orders add column if not exists invoice_pdf_url text;
alter table public.orders add column if not exists created_at timestamptz default now();
alter table public.orders add column if not exists updated_at timestamptz default now();

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  product_id text, variant_id text, product_name text not null, tamil_name text, variant_name text,
  quantity numeric(12,3) not null default 1, unit text not null default 'pc', unit_price numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0, is_manual boolean not null default false,
  source text not null default 'catalogue', note text, created_at timestamptz not null default now()
);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_type_idx on public.orders(order_type);
create index if not exists order_items_order_id_idx on public.order_items(order_id);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(), code text not null unique,
  percentage numeric(5,2) not null default 0, min_order_value numeric(12,2) not null default 0,
  expiry_date date, usage_limit integer, usage_count integer not null default 0,
  is_active boolean not null default true, created_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(), product_id text not null, variant_name text not null,
  size_label text, weight_value numeric(12,3), weight_unit text, sku text, barcode text,
  purchase_price numeric(12,2), mrp numeric(12,2), price numeric(12,2) not null default 0,
  stock numeric(12,3) not null default 0, is_default boolean not null default false,
  is_active boolean not null default true, sort_order integer not null default 0, image_url text, group_name text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists product_variants_product_idx on public.product_variants(product_id, is_active, sort_order);

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
  v_subtotal numeric(12,2) := 0; v_total numeric(12,2); v_delivery numeric(12,2) := greatest(coalesce(p_delivery_charge,0),0);
  v_discount numeric(12,2) := greatest(coalesce(p_discount_amount,0),0); v_manual numeric(12,2) := greatest(coalesce(p_manual_discount_amount,0),0);
  v_item jsonb; v_qty numeric(12,3); v_price numeric(12,2); v_line numeric(12,2); v_product_id bigint; v_stock numeric(12,3); v_source text;
begin
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then raise exception 'At least one item is required'; end if;
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
    v_qty := greatest(coalesce(nullif(v_item->>'quantity','')::numeric,0),0); v_price := greatest(coalesce(nullif(v_item->>'base_price','')::numeric,0),0); v_line := greatest(coalesce(nullif(v_item->>'line_total','')::numeric,v_qty*v_price),0); v_source := coalesce(nullif(v_item->>'source',''),'catalogue');
    v_product_id := case when coalesce(v_item->>'product_id','') ~ '^[0-9]+$' then (v_item->>'product_id')::bigint else null end;
    if v_source <> 'manual' and v_product_id is not null then
      select stock_quantity into v_stock from public.products where id=v_product_id for update;
      if v_stock is null then raise exception 'Product % was not found',v_product_id; end if;
      if v_stock < v_qty then raise exception 'Insufficient stock for %',coalesce(v_item->>'name','product'); end if;
      update public.products set stock_quantity=stock_quantity-v_qty,stock=greatest(0,floor(stock_quantity-v_qty)::integer),updated_at=now() where id=v_product_id;
    end if;
    insert into public.order_items(order_id,product_id,variant_id,product_name,tamil_name,variant_name,quantity,unit,unit_price,line_total,is_manual,source,note)
    values(v_order_id,nullif(v_item->>'product_id',''),nullif(v_item->>'variant_id',''),coalesce(nullif(v_item->>'name',''),'Product'),nullif(v_item->>'tamil_name',''),nullif(v_item->>'variant_name',''),v_qty,coalesce(nullif(v_item->>'unit',''),'pc'),v_price,v_line,v_source='manual',v_source,nullif(v_item->>'note',''));
  end loop;
  if p_coupon_code is not null and trim(p_coupon_code)<>'' then update public.coupons set usage_count=usage_count+1 where upper(code)=upper(trim(p_coupon_code)); end if;
  return query select v_order_id,v_invoice_no,v_now;
end;
$$;

revoke all on function public.create_order_with_stock(text,text,numeric,text,numeric,numeric,jsonb,numeric,text,numeric,text,text,text,numeric,text) from public;
grant execute on function public.create_order_with_stock(text,text,numeric,text,numeric,numeric,jsonb,numeric,text,numeric,text,text,text,numeric,text) to authenticated;

alter table public.orders enable row level security; alter table public.order_items enable row level security; alter table public.coupons enable row level security; alter table public.product_variants enable row level security;
drop policy if exists "Authenticated users can read orders" on public.orders; create policy "Authenticated users can read orders" on public.orders for select to authenticated using (true);
drop policy if exists "Authenticated users can read order items" on public.order_items; create policy "Authenticated users can read order items" on public.order_items for select to authenticated using (true);
drop policy if exists "Authenticated users can read coupons" on public.coupons; create policy "Authenticated users can read coupons" on public.coupons for select to authenticated using (true);
drop policy if exists "Authenticated users can read variants" on public.product_variants; create policy "Authenticated users can read variants" on public.product_variants for select to authenticated using (true);
grant select on public.orders,public.order_items,public.coupons,public.product_variants to authenticated;
notify pgrst, 'reload schema';
commit;
