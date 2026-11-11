-- RLS for menu_presets. Service role bypasses it. Anon has no policy.

ALTER TABLE public.menu_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "menu_presets_service_all" ON public.menu_presets;

-- Refresh PostgREST schema cache after creating menu_presets (run after 016).
NOTIFY pgrst, 'reload schema';
