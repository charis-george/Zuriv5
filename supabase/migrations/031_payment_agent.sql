-- Zuri Assist payment-matching agent: SMS alerts → open orders.

-- -----------------------------------------------------------------------------
-- businesses: agent config
-- -----------------------------------------------------------------------------
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS payment_agent_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS agent_forwarding_number TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS match_window_minutes INT NOT NULL DEFAULT 20;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS agent_staff_msisdn TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS agent_allowed_msisdns TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.businesses.payment_agent_enabled IS 'When true, inbound forwarded bank/POS SMS is matched to open orders.';
COMMENT ON COLUMN public.businesses.agent_forwarding_number IS 'Zuri Africa''s Talking number assigned to this business for SMS forwards.';
COMMENT ON COLUMN public.businesses.match_window_minutes IS 'How far back/forward from alert timestamp to look for order matches.';
COMMENT ON COLUMN public.businesses.agent_staff_msisdn IS 'Staff phone for outbound match / ambiguous SMS.';
COMMENT ON COLUMN public.businesses.agent_allowed_msisdns IS 'Allowlisted phones that may forward payment alerts (fraud guard).';

CREATE INDEX IF NOT EXISTS idx_businesses_agent_forwarding_number
  ON public.businesses (agent_forwarding_number)
  WHERE agent_forwarding_number IS NOT NULL;

-- -----------------------------------------------------------------------------
-- payment_alerts: raw inbound SMS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  source_msisdn TEXT,
  parsed_amount NUMERIC(12, 2),
  parsed_sender_name TEXT,
  parsed_channel TEXT, -- pos | transfer | unknown
  parsed_bank_or_provider TEXT, -- moniepoint | opay | unknown | ...
  alert_timestamp TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  match_status TEXT NOT NULL DEFAULT 'unmatched',
  -- unmatched | auto_matched | pending_review | manually_matched | unmatchable
  matched_order_id UUID REFERENCES public.orders (id) ON DELETE SET NULL,
  confidence_score NUMERIC(3, 2),
  parse_errors TEXT,
  flag_reason TEXT -- partial_payment | overpayment | old_alert | duplicate | unauthorized | ...
);

CREATE INDEX IF NOT EXISTS idx_payment_alerts_business_status
  ON public.payment_alerts (business_id, match_status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_alerts_business_amount_time
  ON public.payment_alerts (business_id, parsed_amount, alert_timestamp);

COMMENT ON TABLE public.payment_alerts IS 'Inbound bank/POS SMS alerts for Zuri Assist payment matching.';
COMMENT ON COLUMN public.payment_alerts.match_status IS
  'unmatched | auto_matched | pending_review | manually_matched | unmatchable';

ALTER TABLE public.payment_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_alerts_service_all" ON public.payment_alerts;

-- -----------------------------------------------------------------------------
-- orders: match metadata (payment_status stays pending|paid|failed|...)
-- -----------------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS matched_alert_id UUID
  REFERENCES public.payment_alerts (id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS confirmed_by TEXT;

COMMENT ON COLUMN public.orders.matched_alert_id IS 'payment_alerts row that confirmed this order via Zuri Assist.';
COMMENT ON COLUMN public.orders.confirmed_by IS 'agent_auto | staff | ...';
COMMENT ON COLUMN public.orders.payment_method IS
  'split | transfer | free | subscription | pos | agent_transfer | cash';

-- -----------------------------------------------------------------------------
-- match_candidates: ambiguous matches before resolution
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.match_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_alert_id UUID NOT NULL REFERENCES public.payment_alerts (id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  confidence_score NUMERIC(3, 2) NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_candidates_alert
  ON public.match_candidates (payment_alert_id);

ALTER TABLE public.match_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "match_candidates_service_all" ON public.match_candidates;

-- -----------------------------------------------------------------------------
-- agent_sms_log: outbound SMS audit
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_sms_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders (id) ON DELETE SET NULL,
  payment_alert_id UUID REFERENCES public.payment_alerts (id) ON DELETE SET NULL,
  recipient_type TEXT NOT NULL, -- staff | customer
  recipient_msisdn TEXT NOT NULL,
  message TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivery_status TEXT -- queued | sent | failed | skipped
);

CREATE INDEX IF NOT EXISTS idx_agent_sms_log_business
  ON public.agent_sms_log (business_id, sent_at DESC);

ALTER TABLE public.agent_sms_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_sms_log_service_all" ON public.agent_sms_log;
