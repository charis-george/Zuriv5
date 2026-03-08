-- Zuri Network Phase 2: Tap linkage + optional preferences
-- Run after 011_zuri_network.sql

-- Link Tap users to the same network identity (by email)
ALTER TABLE zuri_tap_users
ADD COLUMN IF NOT EXISTS zuri_customer_id UUID REFERENCES zuri_network_customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_zuri_tap_users_zuri_customer_id ON zuri_tap_users(zuri_customer_id) WHERE zuri_customer_id IS NOT NULL;
COMMENT ON COLUMN zuri_tap_users.zuri_customer_id IS 'Zuri Network identity; set on login/register from email';

-- Optional preferences (dietary, favorites, etc.) for Phase 2
ALTER TABLE zuri_network_customers
ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}';

COMMENT ON COLUMN zuri_network_customers.preferences IS 'Optional customer preferences (e.g. dietary, favorites); Phase 2';
