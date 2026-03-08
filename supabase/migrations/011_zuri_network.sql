-- Zuri Network: cross-business customer identity (Phase 1)
-- Run in Supabase SQL Editor

-- Global customer identity (one per normalized email)
CREATE TABLE IF NOT EXISTS zuri_network_customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_normalized TEXT UNIQUE NOT NULL,
  phone_normalized TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_zuri_network_customers_email ON zuri_network_customers(email_normalized);
CREATE INDEX IF NOT EXISTS idx_zuri_network_customers_phone ON zuri_network_customers(phone_normalized) WHERE phone_normalized IS NOT NULL;

COMMENT ON TABLE zuri_network_customers IS 'One identity per customer across all Zuri businesses; keyed by normalized email';

-- Precomputed Zuri-wide stats per customer (no PII from other businesses)
CREATE TABLE IF NOT EXISTS zuri_network_customer_stats (
  zuri_customer_id UUID PRIMARY KEY REFERENCES zuri_network_customers(id) ON DELETE CASCADE,
  total_orders INT NOT NULL DEFAULT 0,
  total_spend DECIMAL(12, 2) NOT NULL DEFAULT 0,
  avg_order_value DECIMAL(12, 2) NOT NULL DEFAULT 0,
  business_count INT NOT NULL DEFAULT 0,
  last_order_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE zuri_network_customer_stats IS 'Aggregate stats per network customer for Returning Zuri customer badge';

-- Link orders to network customer
ALTER TABLE orders ADD COLUMN IF NOT EXISTS zuri_customer_id UUID REFERENCES zuri_network_customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_zuri_customer_id ON orders(zuri_customer_id) WHERE zuri_customer_id IS NOT NULL;

COMMENT ON COLUMN orders.zuri_customer_id IS 'Cross-business customer identity (Zuri Network)';

ALTER TABLE zuri_network_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE zuri_network_customer_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zuri_network_customers service role" ON zuri_network_customers FOR ALL USING (true);
CREATE POLICY "zuri_network_customer_stats service role" ON zuri_network_customer_stats FOR ALL USING (true);
