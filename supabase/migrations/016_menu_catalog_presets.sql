-- Switchable catalog presets (e.g. lunch menu vs evening menu, different vendor locations).
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.menu_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  preset_mode TEXT NOT NULL DEFAULT 'menu',
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS active_menu_preset_id UUID;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS preset_id UUID;

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS preset_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_presets_preset_mode_valid'
  ) THEN
    ALTER TABLE public.menu_presets
      ADD CONSTRAINT menu_presets_preset_mode_valid
      CHECK (preset_mode IN ('menu', 'ticketing'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_menu_presets_business_mode
  ON public.menu_presets (business_id, preset_mode, display_order);

CREATE INDEX IF NOT EXISTS idx_categories_preset
  ON public.categories (business_id, preset_id);

CREATE INDEX IF NOT EXISTS idx_menu_items_preset
  ON public.menu_items (business_id, preset_id);

-- One default preset per business per catalog mode (menu / ticketing).
INSERT INTO public.menu_presets (business_id, name, preset_mode, display_order)
SELECT b.id, 'Main menu', 'menu', 0
FROM public.businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM public.menu_presets mp
  WHERE mp.business_id = b.id AND mp.preset_mode = 'menu'
);

INSERT INTO public.menu_presets (business_id, name, preset_mode, display_order)
SELECT b.id, 'Main tickets', 'ticketing', 0
FROM public.businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM public.menu_presets mp
  WHERE mp.business_id = b.id AND mp.preset_mode = 'ticketing'
);

UPDATE public.categories c
SET preset_id = mp.id
FROM public.menu_presets mp
WHERE c.business_id = mp.business_id
  AND c.preset_id IS NULL
  AND mp.preset_mode = COALESCE(NULLIF(c.category_mode, ''), 'menu')
  AND mp.display_order = 0;

UPDATE public.menu_items mi
SET preset_id = mp.id
FROM public.menu_presets mp
WHERE mi.business_id = mp.business_id
  AND mi.preset_id IS NULL
  AND mp.preset_mode = COALESCE(NULLIF(mi.item_mode, ''), 'menu')
  AND mp.display_order = 0;

UPDATE public.businesses b
SET active_menu_preset_id = mp.id
FROM public.menu_presets mp
WHERE b.id = mp.business_id
  AND b.active_menu_preset_id IS NULL
  AND mp.preset_mode = COALESCE(NULLIF(b.business_mode, ''), 'menu')
  AND mp.display_order = 0;
