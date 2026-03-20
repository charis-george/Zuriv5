-- Storefront customizer: persist published theme & details per business

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS storefront_config JSONB,
ADD COLUMN IF NOT EXISTS storefront_details JSONB;

COMMENT ON COLUMN businesses.storefront_config IS 'Published storefront theme config (JSON) used by customer ordering page.';
COMMENT ON COLUMN businesses.storefront_details IS 'Published storefront details (tagline, cuisine tags, etc).';

