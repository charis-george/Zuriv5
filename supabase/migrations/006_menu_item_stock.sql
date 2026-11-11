-- Menu item inventory tracking (manual stock counts + low-stock thresholds)
-- Safe to run multiple times.

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS stock_on_hand INTEGER;

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER;

-- Optional helper: when true, item was auto-hidden due to stock reaching zero.
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS sold_out_auto_hidden BOOLEAN NOT NULL DEFAULT FALSE;

-- Keep updated_at for admin edits / inventory changes.
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Basic safety constraints (only apply if columns exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_stock_on_hand_nonneg'
  ) THEN
    ALTER TABLE public.menu_items
      ADD CONSTRAINT menu_items_stock_on_hand_nonneg
      CHECK (stock_on_hand IS NULL OR stock_on_hand >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_low_stock_threshold_nonneg'
  ) THEN
    ALTER TABLE public.menu_items
      ADD CONSTRAINT menu_items_low_stock_threshold_nonneg
      CHECK (low_stock_threshold IS NULL OR low_stock_threshold >= 0);
  END IF;
END $$;

