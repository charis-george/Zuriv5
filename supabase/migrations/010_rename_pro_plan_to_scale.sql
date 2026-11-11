-- Align legacy "pro" subscriptions with current Scale tier for reporting and UI.
UPDATE public.businesses
SET plan = 'scale'
WHERE plan = 'pro';

COMMENT ON COLUMN public.businesses.plan IS 'free | starter | growth | scale | zuri_plus | enterprise | basic | advanced';