-- Zuri Tap: sessions (business enables Tap for an order) and customer accounts (Tap users)
-- Tap users sign in to pay with saved card; no wallet, no new business bank connection.

-- Customer accounts for Zuri Tap (sign in / sign up required to tap to pay)
CREATE TABLE IF NOT EXISTS zuri_tap_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zuri_tap_users_email ON zuri_tap_users(email);

-- Tap session: when business turns on Zuri Tap for an order, we create a short-lived session
-- Customer opens link /tap/pay/:token, signs in, confirms → charge saved card
CREATE TABLE IF NOT EXISTS zuri_tap_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token TEXT UNIQUE NOT NULL,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zuri_tap_sessions_token ON zuri_tap_sessions(token);
CREATE INDEX IF NOT EXISTS idx_zuri_tap_sessions_order ON zuri_tap_sessions(order_id);
CREATE INDEX IF NOT EXISTS idx_zuri_tap_sessions_expires ON zuri_tap_sessions(expires_at);

ALTER TABLE zuri_tap_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE zuri_tap_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zuri_tap_users service role" ON zuri_tap_users FOR ALL USING (true);
CREATE POLICY "zuri_tap_sessions service role" ON zuri_tap_sessions FOR ALL USING (true);
