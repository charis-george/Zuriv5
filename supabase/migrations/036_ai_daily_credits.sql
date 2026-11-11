-- Daily AI credits for ZuriQO chat + assist (description polish, dish enrich).
-- Resets when ai_credits_day rolls to a new UTC date.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS ai_credits_day DATE;

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS ai_credits_used INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.businesses.ai_credits_day IS
  'UTC calendar day for ai_credits_used counter.';
COMMENT ON COLUMN public.businesses.ai_credits_used IS
  'AI credits consumed on ai_credits_day (ZuriQO + menu assist).';
