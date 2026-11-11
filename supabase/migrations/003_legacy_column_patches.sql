-- If you already had partial tables (e.g. only businesses + menu from an older template),
-- these statements add columns the Node app expects. Safe to run after 001_initial_schema.sql
-- (which creates full tables only when they are missing).

ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS paystack_public_key TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS paystack_recipient_code TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'paystack';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_provider TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS monnify_payment_reference TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paystack_payment_reference TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS bank_code TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS account_name TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS storefront_config JSONB;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS storefront_details JSONB;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS storefront_profiles JSONB;

-- FK to zuri_network_customers: only valid if that table exists (created in 001).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'zuri_network_customers')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders')
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'zuri_customer_id'
     ) THEN
    ALTER TABLE public.orders ADD COLUMN zuri_customer_id UUID REFERENCES public.zuri_network_customers (id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payout_status TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payout_reference TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payout_error TEXT;
