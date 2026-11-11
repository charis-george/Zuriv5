-- Remitted Neural Relay (RNR) pattern memory for guest taste / personalization (per guest + venue).

CREATE TABLE IF NOT EXISTS public.guest_personalization_rnr_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zuri_customer_id UUID NOT NULL REFERENCES public.zuri_network_customers (id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  features JSONB NOT NULL,
  loss DOUBLE PRECISION NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  stored_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.guest_personalization_rnr_patterns IS
  'Per-venue taste feature vectors for uncertain personalization; cosine-matched on later visits to reinforce picks.';

CREATE INDEX IF NOT EXISTS idx_guest_rnr_customer_business_time
  ON public.guest_personalization_rnr_patterns (zuri_customer_id, business_id, stored_at DESC);

ALTER TABLE public.guest_personalization_rnr_patterns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guest_personalization_rnr_patterns_service_all"
  ON public.guest_personalization_rnr_patterns;
