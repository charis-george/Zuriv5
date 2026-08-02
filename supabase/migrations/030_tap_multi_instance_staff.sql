-- Zuri Tap: multi-instance rooms/sessions + per-staff sub-codes (Postgres-backed).

CREATE TABLE IF NOT EXISTS public.tap_business_state (
  business_id UUID PRIMARY KEY REFERENCES public.businesses (id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tap_staff_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'Staff',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  CONSTRAINT tap_staff_codes_code_format CHECK (code ~ '^[A-Z0-9]{6}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS tap_staff_codes_code_active_uidx
  ON public.tap_staff_codes (code)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS tap_staff_codes_business_active_idx
  ON public.tap_staff_codes (business_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.tap_sessions (
  token TEXT PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  staff_code_id UUID REFERENCES public.tap_staff_codes (id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'paid', 'cancelled', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tap_sessions_business_open_idx
  ON public.tap_sessions (business_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS tap_sessions_order_id_idx
  ON public.tap_sessions (order_id);

CREATE INDEX IF NOT EXISTS tap_sessions_expires_at_idx
  ON public.tap_sessions (expires_at);

ALTER TABLE public.tap_business_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tap_staff_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tap_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tap_business_state_service_all" ON public.tap_business_state;
CREATE POLICY "tap_business_state_service_all"
  ON public.tap_business_state FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tap_staff_codes_service_all" ON public.tap_staff_codes;
CREATE POLICY "tap_staff_codes_service_all"
  ON public.tap_staff_codes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tap_sessions_service_all" ON public.tap_sessions;
CREATE POLICY "tap_sessions_service_all"
  ON public.tap_sessions FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.tap_staff_codes IS 'Per-staff Zuri Tap join codes; customers join a specific staff code so requests do not mix across tables.';
COMMENT ON TABLE public.tap_sessions IS 'Tap payment request sessions shared across API instances.';
COMMENT ON TABLE public.tap_business_state IS 'Whether Tap is live for a business (shared across instances).';
