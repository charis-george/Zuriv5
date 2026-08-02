-- Multiple branded storefronts per business (e.g. separate ticketing links per event).
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS storefront_profiles JSONB;

COMMENT ON COLUMN public.businesses.storefront_profiles IS
  'Array of StorefrontProfile objects (id, slug, name, config, details). Legacy storefront_config/details mirror the default profile.';
