-- Guest personalization: dish graph, business groups, network guest identity

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS business_group_id TEXT;

COMMENT ON COLUMN public.businesses.business_group_id IS
  'Optional group key (chain/hotel group). Venues with the same id share cross-venue dish matching.';

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS canonical_dish_id TEXT,
  ADD COLUMN IF NOT EXISTS ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dish_tags JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.menu_items.canonical_dish_id IS
  'Shared catalog id across venues (e.g. franchise SKU). Used for exact cross-venue match.';
COMMENT ON COLUMN public.menu_items.ingredients IS 'JSON array of ingredient strings for taste matching.';
COMMENT ON COLUMN public.menu_items.dish_tags IS 'JSON object: cuisine, protein, course, spice, allergens (string arrays).';

CREATE INDEX IF NOT EXISTS idx_menu_items_canonical_dish_id
  ON public.menu_items (canonical_dish_id)
  WHERE canonical_dish_id IS NOT NULL AND canonical_dish_id <> '';

CREATE INDEX IF NOT EXISTS idx_businesses_business_group_id
  ON public.businesses (business_group_id)
  WHERE business_group_id IS NOT NULL AND business_group_id <> '';

ALTER TABLE public.zuri_network_customers
  ADD COLUMN IF NOT EXISTS guest_token TEXT,
  ADD COLUMN IF NOT EXISTS cross_venue_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_normalized TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_zuri_network_customers_guest_token
  ON public.zuri_network_customers (guest_token)
  WHERE guest_token IS NOT NULL AND guest_token <> '';
