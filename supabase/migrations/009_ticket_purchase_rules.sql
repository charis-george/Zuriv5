-- Ticketing: per-ticket-type purchase rules & metadata
-- max_per_user: maximum tickets one buyer can purchase (null = unlimited)
-- group_size: sell tickets in groups of N (null/1 = individual)
-- min_per_order: minimum quantity required per order (null/1 = no minimum)
-- pricing_type: 'free' | 'paid' | 'invite_only' (null defaults to 'paid')
-- perks: JSONB array of perk strings

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS max_per_user INTEGER;

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS group_size INTEGER;

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS min_per_order INTEGER;

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS pricing_type TEXT;

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS perks JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_max_per_user_positive'
  ) THEN
    ALTER TABLE public.menu_items
      ADD CONSTRAINT menu_items_max_per_user_positive
      CHECK (max_per_user IS NULL OR max_per_user >= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_group_size_positive'
  ) THEN
    ALTER TABLE public.menu_items
      ADD CONSTRAINT menu_items_group_size_positive
      CHECK (group_size IS NULL OR group_size >= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_min_per_order_positive'
  ) THEN
    ALTER TABLE public.menu_items
      ADD CONSTRAINT menu_items_min_per_order_positive
      CHECK (min_per_order IS NULL OR min_per_order >= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_pricing_type_valid'
  ) THEN
    ALTER TABLE public.menu_items
      ADD CONSTRAINT menu_items_pricing_type_valid
      CHECK (pricing_type IS NULL OR pricing_type IN ('free', 'paid', 'invite_only'));
  END IF;
END $$;
