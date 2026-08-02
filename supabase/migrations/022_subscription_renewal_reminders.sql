-- Track renewal reminder emails per billing period.

ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS subscription_renewal_reminder_for TIMESTAMPTZ;

COMMENT ON COLUMN public.businesses.subscription_renewal_reminder_for IS 'Period end date we already sent a renewal reminder for.';
