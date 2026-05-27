-- Add estimated prep/fulfillment time per menu item
-- Used to compute how long customers should expect to wait for their order.
ALTER TABLE public.menu_items
ADD COLUMN IF NOT EXISTS estimated_prep_time INTEGER NOT NULL DEFAULT 15;

