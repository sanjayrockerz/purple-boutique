begin;

create sequence if not exists public.deposit_number_seq start 1;

alter table public.order_items add column if not exists category text;

create table if not exists public.advance_orders (
  id uuid primary key default gen_random_uuid(),
  deposit_id text not null unique,
  customer_name text not null,
  phone text not null,
  address text not null default '',
  product_name text not null,
  category text not null default '',
  description text not null default '',
  total_amount numeric(12,2) not null check (total_amount > 0),
  deposit_amount numeric(12,2) not null check (deposit_amount > 0),
  remaining_balance numeric(12,2) generated always as (total_amount - deposit_amount) stored,
  expected_delivery_date date not null,
  status text not null default 'pending_deposit' check (status in ('pending_deposit','ready_for_delivery','waiting_final_payment','completed','cancelled')),
  remarks text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_order_id uuid unique references public.orders(id),
  invoice_number text unique,
  final_payment_method text,
  constraint advance_deposit_less_than_total check (deposit_amount < total_amount)
);

create table if not exists public.advance_order_timeline (
  id bigint generated always as identity primary key,
  advance_order_id uuid not null references public.advance_orders(id) on delete cascade,
  event_type text not null,
  label text not null,
  remarks text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.advance_order_payments (
  id uuid primary key default gen_random_uuid(),
  advance_order_id uuid not null references public.advance_orders(id) on delete cascade,
  payment_type text not null check (payment_type in ('deposit','remaining')),
  amount numeric(12,2) not null check (amount >= 0),
  payment_method text not null check (payment_method in ('cash','upi','card')),
  remarks text not null default '',
  received_by uuid references auth.users(id) on delete set null,
  received_at timestamptz not null default now(),
  unique (advance_order_id, payment_type)
);

create index if not exists advance_orders_created_idx on public.advance_orders(created_at desc);
create index if not exists advance_orders_status_idx on public.advance_orders(status);
create index if not exists advance_orders_delivery_idx on public.advance_orders(expected_delivery_date);
create index if not exists advance_order_timeline_order_idx on public.advance_order_timeline(advance_order_id, created_at);
create index if not exists advance_order_payments_order_idx on public.advance_order_payments(advance_order_id, received_at);

create or replace function public.create_advance_order(
  p_customer_name text, p_phone text, p_address text, p_product_name text,
  p_category text, p_description text, p_total_amount numeric, p_deposit_amount numeric,
  p_expected_delivery_date date, p_remarks text, p_payment_method text, p_created_by_name text
)
returns public.advance_orders
language plpgsql security definer set search_path = public
as $$
declare v_order public.advance_orders; v_now timestamptz := now(); v_deposit_id text;
begin
  if trim(coalesce(p_customer_name,'')) = '' then raise exception 'Customer name is required'; end if;
  if trim(coalesce(p_phone,'')) = '' then raise exception 'Phone number is required'; end if;
  if trim(coalesce(p_product_name,'')) = '' then raise exception 'Product name is required'; end if;
  if coalesce(p_total_amount,0) <= 0 then raise exception 'Total amount must be greater than zero'; end if;
  if coalesce(p_deposit_amount,0) <= 0 or p_deposit_amount >= p_total_amount then raise exception 'Deposit must be greater than zero and less than the total amount'; end if;
  if lower(coalesce(p_payment_method,'')) not in ('cash','upi','card') then raise exception 'Select a valid deposit payment method'; end if;
  v_deposit_id := 'DEP-' || to_char(v_now at time zone 'Asia/Kolkata','YYYYMMDD') || '-' || lpad(nextval('public.deposit_number_seq')::text,4,'0');
  insert into public.advance_orders(deposit_id,customer_name,phone,address,product_name,category,description,total_amount,deposit_amount,expected_delivery_date,remarks,created_by,created_by_name,created_at,updated_at)
  values(v_deposit_id,trim(p_customer_name),trim(p_phone),trim(coalesce(p_address,'')),trim(p_product_name),trim(coalesce(p_category,'')),trim(coalesce(p_description,'')),round(p_total_amount,2),round(p_deposit_amount,2),p_expected_delivery_date,trim(coalesce(p_remarks,'')),auth.uid(),trim(coalesce(p_created_by_name,'')),v_now,v_now)
  returning * into v_order;
  insert into public.advance_order_payments(advance_order_id,payment_type,amount,payment_method,remarks,received_by,received_at)
  values(v_order.id,'deposit',v_order.deposit_amount,lower(p_payment_method),coalesce(p_remarks,''),auth.uid(),v_now);
  insert into public.advance_order_timeline(advance_order_id,event_type,label,created_by,created_at) values
    (v_order.id,'created','Created',auth.uid(),v_now),
    (v_order.id,'deposit_received','Deposit Received',auth.uid(),v_now);
  return v_order;
end;
$$;

create or replace function public.update_advance_order_status(p_order_id uuid, p_status text, p_remarks text default '')
returns public.advance_orders
language plpgsql security definer set search_path = public
as $$
declare v_order public.advance_orders; v_label text;
begin
  if p_status not in ('pending_deposit','ready_for_delivery','waiting_final_payment','cancelled') then raise exception 'Invalid status transition'; end if;
  select * into v_order from public.advance_orders where id=p_order_id for update;
  if not found then raise exception 'Advance order not found'; end if;
  if v_order.status='completed' then raise exception 'A completed order cannot be changed'; end if;
  v_label := case p_status when 'ready_for_delivery' then 'Tailoring Completed' when 'waiting_final_payment' then 'Customer Contacted' when 'cancelled' then 'Cancelled' else 'Pending Deposit' end;
  update public.advance_orders set status=p_status,remarks=case when trim(coalesce(p_remarks,''))='' then remarks else p_remarks end,updated_at=now() where id=p_order_id returning * into v_order;
  insert into public.advance_order_timeline(advance_order_id,event_type,label,remarks,created_by) values(p_order_id,p_status,v_label,coalesce(p_remarks,''),auth.uid());
  return v_order;
end;
$$;

create or replace function public.add_advance_order_event(p_order_id uuid, p_event_type text, p_label text, p_remarks text default '')
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not exists(select 1 from public.advance_orders where id=p_order_id) then raise exception 'Advance order not found'; end if;
  insert into public.advance_order_timeline(advance_order_id,event_type,label,remarks,created_by) values(p_order_id,p_event_type,p_label,coalesce(p_remarks,''),auth.uid());
end;
$$;

create or replace function public.complete_advance_order(p_order_id uuid, p_payment_method text, p_remarks text default '')
returns table(order_id uuid, invoice_no text, completed_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare v_advance public.advance_orders; v_order_id uuid := gen_random_uuid(); v_invoice text; v_now timestamptz := now(); v_items jsonb;
begin
  if lower(coalesce(p_payment_method,'')) not in ('cash','upi','card') then raise exception 'Select a valid payment method'; end if;
  select * into v_advance from public.advance_orders where id=p_order_id for update;
  if not found then raise exception 'Advance order not found'; end if;
  if v_advance.status='cancelled' then raise exception 'A cancelled order cannot be completed'; end if;
  if v_advance.completed_order_id is not null or v_advance.invoice_number is not null then raise exception 'Invoice already generated for this order'; end if;
  v_invoice := 'PB-' || to_char(v_now at time zone 'Asia/Kolkata','YYYYMMDD') || '-' || lpad(nextval('public.invoice_number_seq')::text,6,'0');
  v_items := jsonb_build_array(jsonb_build_object('name',v_advance.product_name,'category',v_advance.category,'description',v_advance.description,'quantity',1,'base_price',v_advance.total_amount,'line_total',v_advance.total_amount,'unit','piece','unit_type','unit','source','advance_order'));
  insert into public.orders(id,invoice_no,customer_name,phone,address,user_id,items,subtotal,total,status,order_mode,order_type,shipping,delivery_charge,discount_amount,manual_discount_amount,payment_mode,payment_method,created_at,updated_at)
  values(v_order_id,v_invoice,v_advance.customer_name,v_advance.phone,v_advance.address,auth.uid(),v_items,v_advance.total_amount,v_advance.total_amount,'completed','offline','advance_order',0,0,0,0,lower(p_payment_method),lower(p_payment_method),v_now,v_now);
  insert into public.order_items(order_id,product_name,category,quantity,unit,unit_price,line_total,is_manual,source,note)
  values(v_order_id,v_advance.product_name,v_advance.category,1,'piece',v_advance.total_amount,v_advance.total_amount,false,'advance_order',v_advance.description);
  insert into public.advance_order_payments(advance_order_id,payment_type,amount,payment_method,remarks,received_by,received_at)
  values(p_order_id,'remaining',v_advance.remaining_balance,lower(p_payment_method),coalesce(p_remarks,''),auth.uid(),v_now);
  update public.advance_orders set status='completed',completed_at=v_now,completed_order_id=v_order_id,invoice_number=v_invoice,final_payment_method=lower(p_payment_method),remarks=case when trim(coalesce(p_remarks,''))='' then remarks else p_remarks end,updated_at=v_now where id=p_order_id;
  insert into public.advance_order_timeline(advance_order_id,event_type,label,remarks,created_by,created_at) values
    (p_order_id,'remaining_payment_received','Remaining Payment Received',coalesce(p_remarks,''),auth.uid(),v_now),
    (p_order_id,'invoice_generated','Invoice Generated',v_invoice,auth.uid(),v_now);
  return query select v_order_id,v_invoice,v_now;
end;
$$;

alter table public.advance_orders enable row level security;
alter table public.advance_order_timeline enable row level security;
alter table public.advance_order_payments enable row level security;
drop policy if exists "Authenticated users can read advance orders" on public.advance_orders;
create policy "Authenticated users can read advance orders" on public.advance_orders for select to authenticated using (true);
drop policy if exists "Authenticated users can read advance timeline" on public.advance_order_timeline;
create policy "Authenticated users can read advance timeline" on public.advance_order_timeline for select to authenticated using (true);
drop policy if exists "Authenticated users can read advance payments" on public.advance_order_payments;
create policy "Authenticated users can read advance payments" on public.advance_order_payments for select to authenticated using (true);
grant select on public.advance_orders,public.advance_order_timeline,public.advance_order_payments to authenticated;
revoke all on function public.create_advance_order(text,text,text,text,text,text,numeric,numeric,date,text,text,text) from public;
revoke all on function public.update_advance_order_status(uuid,text,text) from public;
revoke all on function public.add_advance_order_event(uuid,text,text,text) from public;
revoke all on function public.complete_advance_order(uuid,text,text) from public;
grant execute on function public.create_advance_order(text,text,text,text,text,text,numeric,numeric,date,text,text,text) to authenticated;
grant execute on function public.update_advance_order_status(uuid,text,text) to authenticated;
grant execute on function public.add_advance_order_event(uuid,text,text,text) to authenticated;
grant execute on function public.complete_advance_order(uuid,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
