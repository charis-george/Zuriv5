-- Minimal demo login only (demo@zuri.com / demo123).
-- For full demo (Zuri AI plan, menus, storefront, sample order & reservations), run:
--   supabase/seed_demo_full.sql

INSERT INTO public.businesses (id, name, email, password, phone, address)
SELECT
  'a0000000-0000-4000-8000-0000000000a1'::uuid,
  'Demo Business',
  'demo@zuri.com',
  '$2a$10$bPIkPJPBvlB0sU935FFrjOG03cQKIwcVw7vkY3VJqcBdOIEIrN7ou',
  NULL,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.businesses WHERE email = 'demo@zuri.com'
);
