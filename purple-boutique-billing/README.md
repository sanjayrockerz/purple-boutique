# Purple Boutique Billing

Independent React, Vite, and Supabase billing administration for Purple Boutique.

## Local setup

1. Copy `.env.example` to `.env` and add the dedicated Purple Boutique Supabase URL, public key, and portal passwords.
2. Apply the SQL files in `supabase/migrations` in filename order.
3. Run `npm install`.
4. Run `npm run dev`.

The app keeps the established dashboard, POS billing, catalog, category, coupon, invoice, receipt, WhatsApp, and print flows. Local browser sessions use Purple Boutique-specific storage keys and do not share state with other shop projects.

## Environment

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_WHATSAPP_NUMBER=601133127107`
- `VITE_ADMIN_PASSWORD`
- `VITE_STAFF_PASSWORD`

The current SVG in `public/purple-boutique-logo.svg` is a temporary placeholder. Replace it with the final logo at the same path when supplied.
