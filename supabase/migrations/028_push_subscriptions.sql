-- Browser push subscriptions for business order alerts
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_business ON push_subscriptions(business_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
