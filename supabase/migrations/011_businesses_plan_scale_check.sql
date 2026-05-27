-- Allow plan value `scale` (current product tier). Older DBs may still have
-- businesses_plan_check listing `pro` but not `scale`, which breaks seeds and upserts.

ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_plan_check;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_plan_check
  CHECK (
    plan IN (
      'free',
      'starter',
      'growth',
      'scale',
      'pro',
      'zuri_plus',
      'enterprise',
      'basic',
      'advanced'
    )
  );

COMMENT ON COLUMN public.businesses.plan IS 'free | starter | growth | scale | pro (legacy) | zuri_plus | enterprise | basic | advanced';
