-- menu = restaurant / food ordering; ticketing = events / ticket-style storefront
ALTER TABLE public.businesses
ADD COLUMN IF NOT EXISTS business_mode TEXT NOT NULL DEFAULT 'menu';

ALTER TABLE public.businesses
DROP CONSTRAINT IF EXISTS businesses_business_mode_check;

ALTER TABLE public.businesses
ADD CONSTRAINT businesses_business_mode_check
CHECK (business_mode IN ('menu', 'ticketing'));
