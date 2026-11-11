-- Paystack recurring subscription billing for SaaS plans.

ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS subscription_interval TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS subscription_cancelled_at TIMESTAMPTZ;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS paystack_customer_code TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS paystack_subscription_code TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS paystack_subscription_token TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS paystack_plan_code TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'businesses_subscription_status_check'
  ) THEN
    ALTER TABLE public.businesses
      ADD CONSTRAINT businesses_subscription_status_check
      CHECK (subscription_status IN ('none', 'active', 'past_due', 'cancelled'));
  END IF;
END $$;

COMMENT ON COLUMN public.businesses.subscription_status IS 'none | active | past_due | cancelled';
COMMENT ON COLUMN public.businesses.subscription_current_period_end IS 'End of current paid billing period (renewal date).';

CREATE TABLE IF NOT EXISTS public.paystack_plan_cache (
  plan_id TEXT NOT NULL,
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'yearly')),
  paystack_plan_code TEXT NOT NULL,
  amount_naira NUMERIC(14, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (plan_id, billing_interval)
);

ALTER TABLE public.paystack_plan_cache ENABLE ROW LEVEL SECURITY;
