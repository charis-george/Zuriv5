-- Scanner access codes: staff phones pair via short code for ticket scanning only (no dashboard login).

CREATE TABLE IF NOT EXISTS public.scanner_access_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS scanner_access_codes_business_id_idx
  ON public.scanner_access_codes (business_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.scanner_access_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scanner_access_codes_service_all" ON public.scanner_access_codes;
