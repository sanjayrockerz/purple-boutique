# Purple Boutique Supabase setup

Apply the migrations in filename order to the dedicated Purple Boutique Supabase project.

1. Run `20260716_0001_purple_boutique_schema.sql`.
2. Run `20260716_0002_purple_boutique_catalog.sql`.
3. Create the owner account in Supabase Authentication and set its `role` metadata to `admin` if customer login is enabled.

The schema migration is idempotent. Invoice numbers use the format `PB-YYYY-000001` and are allocated under a locked database counter to prevent duplicates during concurrent billing.
