-- Business bank details for payouts (instead of Paystack API keys)
-- Payments go to ZURI's Paystack; we transfer to business bank using these details.

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS bank_code TEXT,
ADD COLUMN IF NOT EXISTS bank_name TEXT,
ADD COLUMN IF NOT EXISTS account_number TEXT,
ADD COLUMN IF NOT EXISTS account_name TEXT;

COMMENT ON COLUMN businesses.bank_code IS 'Paystack bank code for payout transfers';
COMMENT ON COLUMN businesses.bank_name IS 'Display name of bank';
COMMENT ON COLUMN businesses.account_number IS 'Business bank account number for payouts';
COMMENT ON COLUMN businesses.account_name IS 'Resolved account name from Paystack';
