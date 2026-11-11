-- Public short storefront slug + guest receipt email branding
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS public_slug TEXT;

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS receipt_email_config JSONB;

COMMENT ON COLUMN public.businesses.public_slug IS
  'Global unique short path for the default storefront (zuriqo.com/{slug}). Null = grandfathered UUID /order/{id} links.';

COMMENT ON COLUMN public.businesses.receipt_email_config IS
  'Guest receipt/ticket email branding: accentColor, subjectTemplate, headerTitle, greeting, footerText, showLogo, showZuriBadge.';

-- Case-insensitive uniqueness (nulls allowed for legacy businesses)
CREATE UNIQUE INDEX IF NOT EXISTS businesses_public_slug_lower_uidx
  ON public.businesses (lower(public_slug))
  WHERE public_slug IS NOT NULL;
