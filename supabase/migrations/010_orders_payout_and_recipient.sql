-- Payout tracking and Paystack transfer recipient reuse
-- Run in Supabase SQL Editor

-- Orders: track payout to business bank account
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS payout_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS payout_reference TEXT,
ADD COLUMN IF NOT EXISTS payout_error TEXT;

COMMENT ON COLUMN orders.payout_status IS 'pending | processing | success | failed | skipped';
COMMENT ON COLUMN orders.payout_reference IS 'Paystack transfer reference for idempotency';
COMMENT ON COLUMN orders.payout_error IS 'Error message if payout failed';

-- Businesses: cache Paystack recipient code to avoid recreating
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS paystack_recipient_code TEXT;

COMMENT ON COLUMN businesses.paystack_recipient_code IS 'Paystack RCP_* code for payout transfers; reused per business';

CREATE INDEX IF NOT EXISTS idx_orders_payout_reference ON orders(payout_reference) WHERE payout_reference IS NOT NULL;
