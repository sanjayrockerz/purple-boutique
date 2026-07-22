-- Migration: 8-digit Invoice Number Generation
-- Ensures invoice numbers are strictly 8 digits in total (e.g., 10000001, 10000002...)

CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START WITH 10000001;

CREATE OR REPLACE FUNCTION public.get_next_invoice_no()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
VOLATILE
AS $$
  SELECT LPAD(nextval('public.invoice_number_seq')::TEXT, 8, '0');
$$;
