-- The Node API uses the Supabase service role, which bypasses row level security.
-- Earlier migrations turned RLS on and then added USING (true) policies. Those policies
-- apply to the anon and authenticated roles, so anyone with the public anon key could
-- read and write passwords, saved cards, orders, and reset tokens through PostgREST.
--
-- This migration denies that path. There are no policies for anon or authenticated.
-- Re-run it any time a later change adds an open policy by mistake.

DO $$
DECLARE
  tbl record;
  pol record;
BEGIN
  FOR tbl IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl.tablename);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl.tablename);
  END LOOP;

  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
