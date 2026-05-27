-- Keep menu and ticketing catalog data separate per business.
-- Safe to run multiple times.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS category_mode TEXT;

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS item_mode TEXT;

UPDATE public.categories AS c
SET category_mode = COALESCE(c.category_mode, b.business_mode, 'menu')
FROM public.businesses AS b
WHERE b.id = c.business_id
  AND (c.category_mode IS NULL OR c.category_mode = '');

UPDATE public.menu_items AS mi
SET item_mode = COALESCE(mi.item_mode, b.business_mode, 'menu')
FROM public.businesses AS b
WHERE b.id = mi.business_id
  AND (mi.item_mode IS NULL OR mi.item_mode = '');

ALTER TABLE public.categories
  ALTER COLUMN category_mode SET DEFAULT 'menu';

ALTER TABLE public.menu_items
  ALTER COLUMN item_mode SET DEFAULT 'menu';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'categories_category_mode_valid'
  ) THEN
    ALTER TABLE public.categories
      ADD CONSTRAINT categories_category_mode_valid
      CHECK (category_mode IN ('menu', 'ticketing'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_item_mode_valid'
  ) THEN
    ALTER TABLE public.menu_items
      ADD CONSTRAINT menu_items_item_mode_valid
      CHECK (item_mode IN ('menu', 'ticketing'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_categories_business_mode
  ON public.categories (business_id, category_mode);

CREATE INDEX IF NOT EXISTS idx_menu_items_business_mode
  ON public.menu_items (business_id, item_mode);
