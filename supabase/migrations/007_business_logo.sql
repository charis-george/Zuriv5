-- Business logo (Starter and above)
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN businesses.logo_url IS 'Public URL of business logo; available on Starter plan and above';
