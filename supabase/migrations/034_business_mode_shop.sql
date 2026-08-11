-- Add shop business mode (catalog / retail) between menu and ticketing.
-- Fees for shop are configured in app code (default 2.5% + ₦25).
-- Drop both legacy *_valid and *_check constraint names from earlier migrations.

ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_business_mode_check;
ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_business_mode_check
  CHECK (business_mode IN ('menu', 'ticketing', 'shop'));

ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_category_mode_check;
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_category_mode_valid;
ALTER TABLE public.categories
  ADD CONSTRAINT categories_category_mode_check
  CHECK (category_mode IN ('menu', 'ticketing', 'shop'));

ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_item_mode_check;
ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_item_mode_valid;
ALTER TABLE public.menu_items
  ADD CONSTRAINT menu_items_item_mode_check
  CHECK (item_mode IN ('menu', 'ticketing', 'shop'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'menu_presets'
  ) THEN
    ALTER TABLE public.menu_presets DROP CONSTRAINT IF EXISTS menu_presets_preset_mode_check;
    ALTER TABLE public.menu_presets DROP CONSTRAINT IF EXISTS menu_presets_preset_mode_valid;
    ALTER TABLE public.menu_presets
      ADD CONSTRAINT menu_presets_preset_mode_check
      CHECK (preset_mode IN ('menu', 'ticketing', 'shop'));
  END IF;
END $$;
