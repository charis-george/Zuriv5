-- RLS for menu_presets (service role bypasses; anon/authenticated need permissive policy if RLS is on).

ALTER TABLE public.menu_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "menu_presets_service_all" ON public.menu_presets;
CREATE POLICY "menu_presets_service_all" ON public.menu_presets FOR ALL USING (true) WITH CHECK (true);

-- Refresh PostgREST schema cache after creating menu_presets (run after 016).
NOTIFY pgrst, 'reload schema';
