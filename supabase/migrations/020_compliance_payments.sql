-- Venue compliance, Paystack split payments, refunds, and moderation.

-- -----------------------------------------------------------------------------
-- businesses: KYC, moderation, Paystack subaccounts
-- -----------------------------------------------------------------------------
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS bank_verified_at TIMESTAMPTZ;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS paystack_subaccount_code TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS moderation_notes TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS kyc_doc_requested_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'businesses_account_status_check'
  ) THEN
    ALTER TABLE public.businesses
      ADD CONSTRAINT businesses_account_status_check
      CHECK (account_status IN ('active', 'under_review', 'suspended', 'disabled'));
  END IF;
END $$;

COMMENT ON COLUMN public.businesses.contact_name IS 'Primary contact person for the venue.';
COMMENT ON COLUMN public.businesses.account_status IS 'active | under_review | suspended | disabled';
COMMENT ON COLUMN public.businesses.bank_verified_at IS 'Set when bank account is server-side resolved.';
COMMENT ON COLUMN public.businesses.paystack_subaccount_code IS 'Paystack subaccount for split checkout.';

-- -----------------------------------------------------------------------------
-- orders: extended payment lifecycle
-- -----------------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(14, 2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_reference TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paystack_transaction_id BIGINT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS dispute_status TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS event_slug TEXT;

COMMENT ON COLUMN public.orders.payment_method IS 'split | transfer | free | subscription';
COMMENT ON COLUMN public.orders.dispute_status IS 'open | resolved | chargeback — set from Paystack dispute webhooks';

-- -----------------------------------------------------------------------------
-- disputes / support tickets (platform-level mediation)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  raised_by TEXT NOT NULL CHECK (raised_by IN ('guest', 'venue', 'platform')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  reason TEXT,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_disputes_order_id ON public.disputes (order_id);
CREATE INDEX IF NOT EXISTS idx_disputes_business_id ON public.disputes (business_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON public.disputes (status);

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
