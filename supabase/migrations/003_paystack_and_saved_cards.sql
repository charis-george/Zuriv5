-- Business Paystack keys: order payments go to business's account
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS paystack_secret_key TEXT,
ADD COLUMN IF NOT EXISTS paystack_public_key TEXT;

COMMENT ON COLUMN businesses.paystack_secret_key IS 'Paystack secret key for receiving order payments';
COMMENT ON COLUMN businesses.paystack_public_key IS 'Paystack public key for frontend (e.g. inline)';

-- Saved cards: customer email -> Paystack authorization for one-click pay
CREATE TABLE IF NOT EXISTS saved_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  authorization_code TEXT NOT NULL,
  last4 TEXT,
  card_type TEXT,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email, business_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_cards_email ON saved_cards(email);
CREATE INDEX IF NOT EXISTS idx_saved_cards_business ON saved_cards(business_id);

-- Tier upgrade payments (money to ZURI)
CREATE TABLE IF NOT EXISTS subscription_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference TEXT UNIQUE NOT NULL,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('basic', 'advanced', 'zuri_plus')),
  amount_kobo INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  paystack_reference TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_payments_reference ON subscription_payments(reference);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_business ON subscription_payments(business_id);

ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Subscription payments viewable by service role" ON subscription_payments FOR ALL USING (true);
